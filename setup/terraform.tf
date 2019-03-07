variable "app" { default = "constellation" }
variable "access_key" {}
variable "secret_key" {}
variable "region" {}

# terraform init -backend-config=terraform.tfvars
terraform {
  backend "s3" {}
}

locals {
  name = "${var.app}${terraform.workspace == "default" ? "" : "-${terraform.workspace}"}"
}

data "external" "local_ip" {
  program = ["sh", "-c", <<EOF
echo '{"ip":"'$(dig +short @resolver1.opendns.com myip.opendns.com)'"}'
EOF
  ]
}

provider "aws" {
  access_key = "${var.access_key}"
  secret_key = "${var.secret_key}"
  region = "${var.region}"
}

data "aws_ami" "web" {
  most_recent = true
  filter {
    name = "name"
    values = ["${var.app}-*"]
  }
  owners = ["self"]
}

resource "aws_vpc" "default" {
  cidr_block = "10.0.0.0/16"
  tags { Name = "${local.name}-vpc" Terraform = "${local.name}" }
}

resource "aws_internet_gateway" "default" {
  vpc_id = "${aws_vpc.default.id}"
  tags { Name = "${local.name}-gateway" Terraform = "${local.name}" }
}

resource "aws_route" "internet_access" {
  route_table_id = "${aws_vpc.default.main_route_table_id}"
  destination_cidr_block = "0.0.0.0/0"
  gateway_id = "${aws_internet_gateway.default.id}"
}

resource "aws_subnet" "a" {
  vpc_id = "${aws_vpc.default.id}"
  cidr_block = "10.0.1.0/24"
  availability_zone = "${var.region}a"
  tags { Name = "${local.name}-1" Terraform = "${local.name}" }
}

resource "aws_security_group" "web" {
  name = "${local.name}-security-web"
  vpc_id = "${aws_vpc.default.id}"
  tags { Terraform = "${local.name}" }
  
  ingress {
    from_port = 22
    to_port = 22
    protocol = "tcp"
    cidr_blocks = [
      "18.0.0.0/9",
      "128.30.0.0/15", "128.52.0.0/16",
      "${data.external.local_ip.result.ip}/32"
    ]
  }
  
  ingress {
    from_port = 80
    to_port = 80
    protocol = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port = 443
    to_port = 443
    protocol = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port = 444
    to_port = 444
    protocol = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_key_pair" "app" {
  key_name = "${local.name}"
  public_key = "${file("~/.ssh/aws_${var.app}.pub")}"
}

resource "aws_instance" "web" {
  instance_type = "t3.small"
  ami = "${data.aws_ami.web.id}"
  vpc_security_group_ids = ["${aws_security_group.web.id}"]
  subnet_id = "${aws_subnet.a.id}"
  associate_public_ip_address = true
  key_name = "${aws_key_pair.app.id}"
  root_block_device {
    volume_type = "gp2"
    delete_on_termination = false
  }
  iam_instance_profile = "${aws_iam_instance_profile.web.name}"
  user_data = "${data.template_cloudinit_config.config_web.rendered}"
  tags { Name = "${local.name}" Terraform = "${local.name}" }
  volume_tags { Name = "${local.name}" Terraform = "${local.name}" }
  connection {
    user = "ubuntu"
    private_key = "${file("~/.ssh/aws_${var.app}")}"
  }
  provisioner "file" {
    source = "production/"
    destination = "/var/${var.app}/server"
  }
  provisioner "remote-exec" {
    inline = ["/var/${var.app}/setup/production-provision.sh ${var.region} ${aws_ebs_volume.mongodb.id}"]
  }
  lifecycle { ignore_changes = ["volume_tags"] }
}

resource "aws_ebs_volume" "mongodb" {
  availability_zone = "${var.region}a"
  size = 4
  type = "gp2"
  tags { Name = "${local.name}-mongodb" Terraform = "${local.name}" }
  lifecycle { prevent_destroy = true }
}

resource "aws_eip" "web" {
  instance = "${aws_instance.web.id}"
  vpc = true
  tags { Name = "${local.name}" Terraform = "${local.name}" }
}

data "template_cloudinit_config" "config_web" {
  part {
    content_type = "text/cloud-config"
    content = <<EOF
runcmd:
- systemctl enable ${var.app}
EOF
  }
}

data "aws_iam_policy_document" "assume_role_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "web" {
  name = "${local.name}-web-role"
  assume_role_policy = "${data.aws_iam_policy_document.assume_role_ec2.json}"
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "web_access" {
  statement {
    actions = ["ec2:AttachVolume"]
    resources = ["arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/*", "${aws_ebs_volume.mongodb.arn}"]
  }
}

resource "aws_iam_role_policy" "web" {
  name = "${local.name}-web-access"
  role = "${aws_iam_role.web.id}"
  policy = "${data.aws_iam_policy_document.web_access.json}"
}

resource "aws_iam_instance_profile" "web" {
  name = "${local.name}-web-profile"
  role = "${aws_iam_role.web.name}"
  depends_on = ["aws_iam_role_policy.web"]
}

output "web-address" { value = "${aws_eip.web.public_ip}" }
