# Update packages list before attempting to install any
exec {
  'apt-get update':
    command => '/usr/bin/apt-get update';
}
Exec['apt-get update'] -> Package <| |>

# Add archive for Node.js before attempting to install it
exec {
  'add-apt node':
    command => 'add-apt-repository ppa:chris-lea/node.js && apt-get update',
    path => [ '/usr/bin', '/bin' ],
    creates => '/etc/apt/sources.list.d/chris-lea-node_js-precise.list';
}
Package['python-software-properties'] -> Exec['add-apt node'] -> Package['nodejs']

# Install packages
package {
  [ 'git', 'g++', 'make', 'python-software-properties', 'vim',
    'nodejs' ]:
    ensure => 'installed';
}

# Install Node packages
exec {
  'npm install':
    command => '/usr/bin/npm install',
    cwd => "$app_path/server",
    creates => "$app_path/server/node_modules";
}
Package <| |> -> Exec['npm install']

# Generate SSL certificate
exec {
  'ssl certificate':
    command => 'openssl genrsa -out ssl-private-key.pem 2048 && openssl req -new -key ssl-private-key.pem -config ssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem',
    path => '/usr/bin',
    cwd => "$app_path/server/config",
    creates => "$app_path/server/config/ssl-certificate.pem";
  
  'ssl ca':
    command => 'wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem',
    path => '/usr/bin',
    cwd => "$app_path/server/config",
    creates => "$app_path/server/config/ssl-ca.pem";
}
