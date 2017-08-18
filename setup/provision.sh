#!/bin/bash

set -ex

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done

# Create daemon user
adduser --system $APP

# Go to app directory & obtain application code
mkdir /var/$APP
cd /var/$APP
tar xf /tmp/$APP.tar
chown -R $ADMIN:$ADMIN /var/$APP

# App provisioning
source setup/setup.sh /var/$APP $APP

# Go to server directory
cd server

# Set permissions on sensitive directories
chown $APP:$ADMIN config
chmod 770 config

# Set permissions on sensitive files
chown $APP:$ADMIN config/ssl-*.pem
chmod 660 config/ssl-*.pem

# Allow app to bind to well-known ports
apt-get install -y authbind
for port in 80 443 444; do
  touch /etc/authbind/byport/$port
  chown $APP /etc/authbind/byport/$port
  chmod u+x /etc/authbind/byport/$port
done

# Install Node.js packages
npm install

# Security updates
cat > /etc/apt/apt.conf.d/25auto-upgrades <<< 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Remove-Unused-Dependencies "true";'
