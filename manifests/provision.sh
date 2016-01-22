#!/bin/bash

set -ex

# Wait for instance configuration to finish
while [ ! -f /var/lib/cloud/instance/boot-finished ]; do sleep 2; done

# Go to app directory & obtain application code
mkdir /var/$APP
cd /var/$APP
tar xf /tmp/$APP.tar
chown -R $ADMIN:$ADMIN /var/$APP

# Create daemon user
adduser --system $APP

# App provisioning
source /tmp/$APP-setup.sh /var/$APP .

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
