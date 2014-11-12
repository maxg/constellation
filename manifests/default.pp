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
    unless => '/usr/bin/test -f /etc/apt/sources.list.d/chris-lea-node_js*.list';
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
    cwd => "$app_path",
    creates => "$app_path/node_modules";
}
Package <| |> -> Exec['npm install']

# Generate SSL certificate
exec {
  'ssl certificate':
    command => 'openssl genrsa -out ssl-private-key.pem 2048 && openssl req -new -key ssl-private-key.pem -config ssl.conf | openssl x509 -req -signkey ssl-private-key.pem -out ssl-certificate.pem',
    path => '/usr/bin',
    cwd => "$app_path/config",
    creates => "$app_path/config/ssl-certificate.pem";
  
  'ssl ca':
    command => 'wget -q -O - http://ca.mit.edu/mitClient.crt | openssl x509 -inform der -out ssl-ca.pem',
    path => '/usr/bin',
    cwd => "$app_path/config",
    creates => "$app_path/config/ssl-ca.pem";
}

# Set time zone
file {
  '/etc/timezone':
    content => "America/New_York\n";
}
exec {
  'reconfigure tzdata':
    command => '/usr/sbin/dpkg-reconfigure tzdata',
    subscribe => File['/etc/timezone'],
    require => File['/etc/timezone'],
    refreshonly => true;
}

# Security updates
file {
  '/etc/apt/apt.conf.d/25auto-upgrades':
    content => 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";';
}
