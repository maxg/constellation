#!/bin/bash

cd "$1"
user="$2"
set -v

# Apt Repositories
cat > /etc/apt/sources.list.d/nodesource.list <<< 'deb https://deb.nodesource.com/node_6.x trusty main'
wget -qO - https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
cat > /etc/apt/sources.list.d/mongodb-org.list <<< 'deb http://repo.mongodb.org/apt/ubuntu trusty/mongodb-org/3.4 multiverse'
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 0C49F3730359A14518585931BC711F9BA15703C6
apt-get update

# Development
apt-get install -y git vim

# Node
apt-get install -y nodejs build-essential g++ make python-software-properties

# MongoDB
apt-get install -y mongodb-org

# SSL
(
  cd server/config
  # Fetch CA certificate
  [ -f ssl-ca.pem ] || wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem
  # Generate self-signed certificate
  [ -f ssl-private-key.pem ] || openssl genrsa -out ssl-private-key.pem 2048
  [ -f ssl-certificate.pem ] || openssl req -new -key ssl-private-key.pem -config openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem
)

# Time zone
cat > /etc/timezone <<< America/New_York
dpkg-reconfigure -f noninteractive tzdata
