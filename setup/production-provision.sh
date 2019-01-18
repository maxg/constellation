#!/bin/bash

set -ex

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done
sleep 1

# Start daemon
sudo systemctl start constellation

# Output SSH host key fingerprints
grep --only-matching 'ec2:.*' /var/log/syslog
