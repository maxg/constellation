#!/bin/bash

set -v

# Apt Repositories
cat > /etc/apt/sources.list.d/nodesource.list <<< 'deb https://deb.nodesource.com/node_12.x bionic main'
wget -qO - https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
cat > /etc/apt/sources.list.d/mongodb-org.list <<< 'deb https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse'
wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | apt-key add -
add-apt-repository ppa:certbot/certbot
apt-get update

# Development
apt-get install -y git vim

# Node
apt-get install -y nodejs build-essential g++ make software-properties-common certbot

# MongoDB
apt-get install -y mongodb-org

# AWS CLI
apt-get install -y python-pip jq
pip install awscli --upgrade

# Time zone
timedatectl set-timezone America/New_York
