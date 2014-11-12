#!/bin/bash

#
# Packer pre-Puppet setup.
#

set -ex

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done

# Install Puppet
apt-get update
apt-get install -y puppet

# Create daemon user
adduser --system $APP

# Go to app directory & obtain application code
mkdir /var/$APP
cd /var/$APP
tar xf /tmp/$APP.tar
chown -R $ADMIN:$ADMIN /var/$APP

# Set permissions on sensitive directories
chown $APP:$ADMIN config
chmod 770 config

# Allow app to bind to well-known ports
apt-get install -y authbind
for port in 80 443 444; do
  touch /etc/authbind/byport/$port
  chown $APP /etc/authbind/byport/$port
  chmod u+x /etc/authbind/byport/$port
done
