#!/bin/bash

set -ex

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done

# Go to app directory & obtain application code
mkdir /var/$APP
cd /var/$APP
tar xf /tmp/$APP.tar

# Create daemon user
adduser --system $APP

# App provisioning
source setup/setup.sh

# Go to server directory
cd server

# Set permissions
chown -R $ADMIN:$ADMIN /var/$APP
chown $APP:$ADMIN config log
chmod 770 config log

# Allow app to bind to well-known ports
apt-get install -y authbind
for port in 80 443 444; do
  touch /etc/authbind/byport/$port
  chown $APP /etc/authbind/byport/$port
  chmod u+x /etc/authbind/byport/$port
done

# Install Node.js packages
sudo -u $ADMIN npm install --production

# Daemon
cat > /lib/systemd/system/constellation.service <<EOD
[Unit]
After=network.target mongod.service
Requires=mongod.service

[Service]
User=constellation
ExecStart=/var/constellation/server/bin/constellation
ExecStartPre=/var/constellation/server/bin/wait-for-mongo

[Install]
WantedBy=multi-user.target
EOD

# Security updates
cat > /etc/apt/apt.conf.d/25auto-upgrades <<EOD
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOD

# Rotate away logs from provisioning
logrotate -f /etc/logrotate.conf 
