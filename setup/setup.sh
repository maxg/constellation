#!/bin/bash

set -v

# Apt Repositories
cat > /etc/apt/sources.list.d/nodesource.list <<< 'deb https://deb.nodesource.com/node_10.x bionic main'
wget -qO - https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
cat > /etc/apt/sources.list.d/mongodb-org.list <<< 'deb https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.0 multiverse'
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
apt-get update

# Development
apt-get install -y git vim

# Node
apt-get install -y nodejs build-essential g++ make software-properties-common

# MongoDB
apt-get install -y mongodb-org

# SSL
(
  cd server/config
  # Fetch CA certificate
  [ -f ssl-ca.pem ] || wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem
  # Generate self-signed certificate
  [ -f ssl-private-key.pem ] || openssl genrsa 2048 > ssl-private-key.pem
  [ -f ssl-certificate.pem ] || openssl req -new -key ssl-private-key.pem -config ../../setup/openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem
)

# Time zone
timedatectl set-timezone America/New_York
