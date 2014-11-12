#!/bin/bash

#
# Packer post-Puppet provisioning.
#

set -ex

cd /var/$APP

# Set permissions on sensitive files
chown $APP:$ADMIN config/ssl-*.pem
chmod 660 config/ssl-*.pem
