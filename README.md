Constellation
=============

**Classroom collaborative coding in Eclipse**

Enables collaborative programming in the Eclipse IDE -- think *Google Docs for Eclipse*.
Designed for active learning in the classroom, with students working in pairs on small exercises.


Server Development
------------------

Install [VirtualBox] and [Vagrant].

  [VirtualBox]: http://www.virtualbox.org/
  [Vagrant]: http://www.vagrantup.com/

Run `vagrant up` to download, configure, and provision the VM. Use `vagrant ssh` to log in. The `/vagrant` directory gives the VM read/write access to the project.

In `/vagrant/server`...

- run `npm install`
- fill in `config/env-development.js` by copying from the example file

Run `node app` to start the server, and visit it at https://10.18.6.121:4443/. Safari will not open WebSocket connections with the self-signed SSL cert, use Chrome instead.


Client Development
------------------

Install the current [JDK] and [Eclipse for RCP and RAP Developers][Eclipse]. Use a separate workspace from *e.g.* Eclipse for Java.

  [JDK]: http://www.oracle.com/technetwork/java/javase/downloads/
  [Eclipse]: http://www.eclipse.org/

To download required JAR files into `plugin/lib`, either:

- install [Maven] and run `bin/libs`, *or*
- set up and start the Vagrant VM as described above, and in `/vagrant` run...
  - `apt-get install maven`
  - `bin/libs`

  [Maven]: http://maven.apache.org/

Import the `constellation-feature` and `constellation-plugin` projects into Eclipse.

Create a run configuration:

- *Run* &rarr; *Run Configurations...*
- click *Eclipse Application* and click the *New launch configuration* button
- Name: rename it to `constellation`
- Main tab (verify these but no changes should be needed)
  - Workspace Data: Location should end in `runtime-constellation`
  - Program to Run: Run a product: `org.eclipse.platform.ide`
  - Java Runtime Environment: Execution environment: *JavaSE-1.8*
- Plug-ins tab
  - Launch with: *all workspace and enabled target plug-ins* is fine but slow
  - check *Validate Plug-ins automatically prior to launching*
- Configuration tab
  - Configuration Area: check *Clear the configuration area before launching*
- Common tab
  - Save as: Shared file: `/constellation-plugin`

Click *Apply* to save. Click *Run* to launch Eclipse with Constellation. The bottom toolbar should include a *Collaborate* button.


Resources
---------

- [MongoDB](https://docs.mongodb.com/manual/reference/)
- [ShareDB](https://github.com/share/sharedb/)


Icons
-----

- [Eclipse logo](http://www.eclipse.org/artwork/)


Word List
---------

- 512 words from the [PGP word list](https://en.wikipedia.org/wiki/PGP_word_list), with a few substitutions
- 128 additional computer science-y words
