#!/bin/bash

set -v

# Apt Repositories
cat > /etc/apt/sources.list.d/nodesource.list <<< 'deb https://deb.nodesource.com/node_12.x bionic main'
wget -qO - https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
cat > /etc/apt/sources.list.d/mongodb-org.list <<< 'deb https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse'
wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | apt-key add -
apt-get update

# Development
apt-get install -y git vim

# Node
apt-get install -y nodejs build-essential g++ make software-properties-common

# MongoDB
apt-get install -y mongodb-org

# AWS CLI
apt-get install -y python-pip jq
pip install awscli --upgrade

# SSL
(
  cd server/config
  # Generate self-signed certificate
  [ -f ssl-private-key.pem ] || openssl genrsa 2048 > ssl-private-key.pem
  [ -f ssl-certificate.pem ] || openssl req -new -key ssl-private-key.pem -config ../../setup/openssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem
)

# Time zone
timedatectl set-timezone America/New_York
