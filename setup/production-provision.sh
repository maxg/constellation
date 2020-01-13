#!/bin/bash

set -ex

region=$1
mongodb_volume_id=$2

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done
sleep 1

instance_id=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

# Output and tag SSH host key fingerprints
grep --only-matching 'ec2: .*' /var/log/syslog | sed -n '/BEGIN SSH/,/END/p' | tee /dev/fd/2 |
grep --only-matching '.\+ .\+:.\+ .\+ (.\+)' |
while read _ _ hash _ type; do echo "Key=SSH $type,Value=$hash"; done |
xargs -d "\n" aws --region $region ec2 create-tags --resources $instance_id --tags

# Mount MongoDB storage
sudo aws --region $region ec2 attach-volume --instance-id $instance_id --volume-id $mongodb_volume_id --device /dev/sdf
while [ ! -b /dev/nvme1n1 ]; do sleep 2; done
if [ "$(sudo blkid -o value -s TYPE /dev/nvme1n1)" == "" ]; then sudo mkfs.xfs /dev/nvme1n1; fi
sudo tee -a /etc/fstab <<< '/dev/nvme1n1 /var/lib/mongodb xfs noatime,noexec 0 0'
sudo mount /var/lib/mongodb
sudo chown -R mongodb:mongodb /var/lib/mongodb

# Start daemon
sudo systemctl start constellation
