#!/bin/bash

cd "$1"

app_path="$2"

# Apt Repositories
cat > /etc/apt/sources.list.d/nodesource.list <<< 'deb https://deb.nodesource.com/node_5.x trusty main'
wget -qO - https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -

apt-get update

# Development
apt-get install -y git vim

# Node
apt-get install -y nodejs build-essential g++ make python-software-properties

# Node packages
(
    cd "$app_path"
    npm install
)

# SSL
(
  cd "$app_path"/config
  # Fetch CA certificate
  [ -f ssl-ca.pem ] || wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem
  # Generate self-signed certificate
  [ -f ssl-private-key.pem ] || openssl genrsa -out ssl-private-key.pem 2048
  [ -f ssl-certificate.pem ] || openssl req -new -key ssl-private-key.pem -config ssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem
)

# Time zone
cat > /etc/timezone <<< America/New_York
dpkg-reconfigure -f noninteractive tzdata

# Security updates
cat > /etc/apt/apt.conf.d/25auto-upgrades <<< 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";'
