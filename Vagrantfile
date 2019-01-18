Vagrant.configure("2") do |config|

  config.vm.box = "ubuntu/bionic64"

  config.vm.network "private_network", ip: "10.18.6.121"

  config.vm.provider "virtualbox" do |vb|
    # disable ubuntu-...-cloudimg-console.log
    vb.customize [ "modifyvm", :id, "--uartmode1", "disconnected" ]
  end

  config.vm.provision "shell", path: "setup/development.sh"

end
