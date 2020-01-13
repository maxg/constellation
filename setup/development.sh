#!/bin/bash

cd /vagrant

source setup/setup.sh

# Generate self-signed certificate
(
  cd server/config
  mkdir -p tls
  [ -f tls/privkey.pem ] || openssl genrsa 2048 > tls/privkey.pem
  [ -f tls/fullchain.pem ] || openssl req -new -key tls/privkey.pem -config ../../setup/openssl.conf | openssl x509 -req -signkey tls/privkey.pem -out tls/fullchain.pem
)
