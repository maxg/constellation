variable "bucket" {}
variable "key" {}
variable "region" {}
variable "access_key" {}
variable "secret_key" {}

variable "web_hosts" {}
variable "le_contact" {}

# terraform init -backend-config=terraform.tfvars
terraform {
  required_version = "~> 1.0.5"
  required_providers {
    aws = { source = "hashicorp/aws" }
    template = { source = "hashicorp/template" }
  }
  backend "s3" {}
}

locals {
  app = var.key
  name = "${local.app}${terraform.workspace == "default" ? "" : "-${terraform.workspace}"}"
}

provider "aws" {
  access_key = var.access_key
  secret_key = var.secret_key
  region = var.region
}

data "aws_ami" "web" {
  most_recent = true
  filter {
    name = "name"
    values = ["${local.app}-*"]
  }
  owners = ["self"]
}

resource "aws_vpc" "default" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = {
    Name = "${local.name}-vpc"
    Terraform = local.name
  }
}

resource "aws_internet_gateway" "default" {
  vpc_id = aws_vpc.default.id
  tags = {
    Name = "${local.name}-gateway"
    Terraform = local.name
  }
}

resource "aws_route" "internet_access" {
  route_table_id = aws_vpc.default.main_route_table_id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id = aws_internet_gateway.default.id
}

resource "aws_subnet" "a" {
  vpc_id = aws_vpc.default.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "${var.region}a"
  tags = {
    Name = "${local.name}-1"
    Terraform = local.name
  }
}

resource "aws_subnet" "c" {
  vpc_id = aws_vpc.default.id
  cidr_block = "10.0.3.0/24"
  availability_zone = "${var.region}a"
  tags = {
    Name = "${local.name}-3"
    Terraform = local.name
  }
}

resource "aws_security_group" "nfs" {
  name = "${local.name}-security-nfs"
  vpc_id = aws_vpc.default.id
  tags = {
    Terraform = local.name
  }
  
  ingress {
    from_port = 2049
    to_port = 2049
    protocol = "tcp"
    security_groups = [aws_security_group.web.id]
  }
  
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    security_groups = [aws_security_group.web.id]
  }
}

resource "aws_efs_file_system" "tls" {
  tags = {
    Name = "${local.name}-tls"
    Terraform = local.name
  }
}

resource "aws_efs_mount_target" "tls" {
  file_system_id = aws_efs_file_system.tls.id
  subnet_id = aws_subnet.c.id
  security_groups = [aws_security_group.nfs.id]
}

data "aws_ssm_parameter" "admin_cidr_blocks" {
  name = "/${var.bucket}/admin-cidr-blocks"
}

resource "aws_security_group" "web" {
  name = "${local.name}-security-web"
  vpc_id = aws_vpc.default.id
  tags = {
    Terraform = local.name
  }
  
  ingress {
    from_port = 22
    to_port = 22
    protocol = "tcp"
    cidr_blocks = split(",", data.aws_ssm_parameter.admin_cidr_blocks.value)
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
  key_name = local.name
  public_key = file("~/.ssh/aws_${local.app}.pub")
}

resource "aws_instance" "web" {
  instance_type = "t3a.small"
  ami = data.aws_ami.web.id
  vpc_security_group_ids = [aws_security_group.web.id]
  subnet_id = aws_subnet.a.id
  associate_public_ip_address = true
  key_name = aws_key_pair.app.id
  root_block_device {
    volume_type = "gp2"
    delete_on_termination = false
  }
  iam_instance_profile = aws_iam_instance_profile.web.name
  user_data = data.template_cloudinit_config.config_web.rendered
  tags = {
    Name = local.name
    Terraform = local.name
  }
  volume_tags = {
    Name = local.name
    Terraform = local.name
  }
  connection {
    type = "ssh"
    host = self.public_ip
    user = "ubuntu"
    private_key = file("~/.ssh/aws_${local.app}")
  }
  provisioner "file" {
    source = "production/"
    destination = "/var/${local.app}/server"
  }
  lifecycle { ignore_changes = [tags, volume_tags] }
}

resource "aws_ebs_volume" "mongodb" {
  availability_zone = "${var.region}a"
  size = 4
  type = "gp2"
  tags = {
    Name = "${local.name}-mongodb"
    Terraform = local.name
  }
  lifecycle { prevent_destroy = true }
}

resource "aws_eip" "web" {
  vpc = true
  tags = {
    Name = local.name
    Terraform = local.name
  }
}

resource "aws_eip_association" "web_address" {
  instance_id = aws_instance.web.id
  allocation_id = aws_eip.web.id
  provisioner "local-exec" { command = "sleep 15" } // wait for EIP to switch
}

data "template_cloudinit_config" "config_web" {
  part {
    content_type = "text/x-shellscript"
    content = <<-EOF
      #!/bin/bash
      APP=${local.app} AWS_DEFAULT_REGION=${var.region} \
      EIP=${aws_eip.web.public_ip} HOSTS=${join(",", var.web_hosts)} CONTACT=${var.le_contact} \
      TLS_FS=${aws_efs_file_system.tls.id} \
      MONGO_VOL=${aws_ebs_volume.mongodb.id} \
      /var/${local.app}/setup/production-provision.sh
    EOF
  }
}

resource "aws_dlm_lifecycle_policy" "backup" {
  description = "${local.name} backup"
  execution_role_arn = aws_iam_role.backup.arn
  policy_details {
    resource_types = ["VOLUME"]
    target_tags = {
      Name = "${local.name}-mongodb"
    }
    schedule {
      name = "${local.name}-mongodb backup"
      create_rule {
        interval = 24
        times = ["04:00"]
      }
      retain_rule {
        count = 2
      }
      tags_to_add = {
        Name = "${local.name}-mongodb backup"
      }
    }
  }
}

data "aws_caller_identity" "current" {}

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
  assume_role_policy = data.aws_iam_policy_document.assume_role_ec2.json
}

data "aws_iam_policy_document" "web_access" {
  statement {
    actions = ["ec2:CreateTags"]
    resources = ["arn:aws:ec2:${var.region}:*:instance/*"]
  }
  statement {
    actions = ["ec2:AttachVolume"]
    resources = ["arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/*", aws_ebs_volume.mongodb.arn]
  }
}

resource "aws_iam_role_policy" "web" {
  name = "${local.name}-web-access"
  role = aws_iam_role.web.id
  policy = data.aws_iam_policy_document.web_access.json
}

resource "aws_iam_instance_profile" "web" {
  name = "${local.name}-web-profile"
  role = aws_iam_role.web.name
  depends_on = [aws_iam_role_policy.web]
}

data "aws_iam_policy_document" "assume_role_dlm" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name = "${local.name}-backup-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role_dlm.json
}

data "aws_iam_policy_document" "backup_access" {
  statement {
    actions = ["ec2:CreateSnapshot", "ec2:DeleteSnapshot", "ec2:DescribeVolumes", "ec2:DescribeSnapshots"]
    resources = ["*"]
  }
  statement {
    actions = ["ec2:CreateTags"]
    resources = ["arn:aws:ec2:${var.region}::snapshot/*"]
  }
}

resource "aws_iam_role_policy" "backup" {
  name = "${local.name}-backup-access"
  role = aws_iam_role.backup.id
  policy = data.aws_iam_policy_document.backup_access.json
}

output "web-address" { value = aws_eip.web.public_ip }
