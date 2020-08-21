#!/bin/bash

set -eux

# Wait for instance to have assigned IP
while [ $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4) != $EIP ]; do sleep 2; done
sleep 1

instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

# Output and tag SSH host key fingerprints
for f in /etc/ssh/ssh_host_*key.pub; do ssh-keygen -l -f "$f"; done |
while read _ hash _ type; do echo "Key=SSH $type,Value=$hash"; done |
xargs -d "\n" aws ec2 create-tags --resources $instance_id --tags

# Mount MongoDB storage
sudo aws --region $AWS_DEFAULT_REGION ec2 attach-volume --instance-id $instance_id --volume-id $MONGO_VOL --device /dev/sdf
while [ ! -b /dev/nvme1n1 ]; do sleep 2; done
if [ "$(sudo blkid -o value -s TYPE /dev/nvme1n1)" == "" ]; then sudo mkfs.xfs /dev/nvme1n1; fi
sudo tee -a /etc/fstab <<< '/dev/nvme1n1 /var/lib/mongodb xfs noatime,noexec 0 0'
sudo mount /var/lib/mongodb
sudo chown -R mongodb:mongodb /var/lib/mongodb

# Mount TLS filesystem
sudo tee --append /etc/fstab <<< "$TLS_FS:/ /etc/letsencrypt efs tls,_netdev 0 0"
sudo mount /etc/letsencrypt

# Start Certbot
sudo certbot certonly --standalone --non-interactive --agree-tos --email $CONTACT --domains $HOSTS --cert-name $APP
(
  cd /etc/letsencrypt
  sudo tee renewal-hooks/post/permit <<EOD
cd /etc/letsencrypt
chmod o+x archive live
chown -R $APP archive/$APP
EOD
  sudo chmod +x renewal-hooks/post/permit
  sudo renewal-hooks/post/permit
)
sudo systemctl --now enable certbot.timer
ln -s /etc/letsencrypt/live/$APP /var/$APP/server/config/tls

# Start daemon
sudo systemctl enable --now $APP
