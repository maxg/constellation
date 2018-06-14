Constellation
=============

**Classroom collaborative coding in Eclipse**

Enables collaborative programming in the Eclipse IDE -- think *Google Docs for Eclipse*.
Designed for active learning in the classroom, with students working in pairs on small exercises.

http://maxg.github.io/constellation


Server Development
------------------

Install [VirtualBox] and [Vagrant].

  [VirtualBox]: http://www.virtualbox.org/
  [Vagrant]: http://www.vagrantup.com/

Run `vagrant up` to download, configure, and provision the VM. Use `vagrant ssh` to log in. The `/vagrant` directory gives the VM read/write access to the project.

In `/vagrant/server`...

- run `npm install`
- fill in `config/env-development.js` by copying from the example file
  - start with an empty array of `staff`
  - `userFakery` enabled: usernames will be mangled so that the same user has a different username in different browsers
  - `secret` can be any string

Run `node app` to start the server, and visit it at https://10.18.6.121:4443/. Safari will not open WebSocket connections with the self-signed SSL cert, use Chrome instead to visit pages with WebSockets.

With `userFakery` on, note your mangled username in the upper right corner of the landing page to add it to the `staff` list.
Restart the server and visit it again as staff to see a link to *All projects*.


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
- Name: rename it to `constellation-1`
- Main tab (verify these but no changes should be needed)
  - Workspace Data: Location should end in `runtime-constellation-1`
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

Once that works, create a second run configuration:

- call it `constellation-2`, with a workspace location that ends in `runtime-constellation-2`
- all other settings identical

You should be able to launch both the `constellation-1` and `constellation-2` configurations at the same time.

Configure `constellation-2` to use a different browser (*e.g.* Safari if your default browser is Chrome). Both browsers must have your MIT certificate. With `userFakery` on, using different browsers will allow the two Eclipses to pair by acting as different users:

- in the `constellation-2` Eclipse, open *Preferences*
- *General* &rarr; *Web Browser*
- click *New*, enter a name (*e.g.* Safari) and *Browse...* to the application (*e.g.* `/Applications/Safari.app`)
- click *Use external web browser* and check the new browser you added
- click *OK*

Let's collaborate! In both development Eclipses:

- create a project (*e.g.* `hello`) and a Java file (*e.g.* `Hello.java`)
- *Collaborate* and select that project
- the first Eclipse should open the pairing page in your default browser, and the second should use the alternate browser you configured
- complete the pairing
- edit the Java file


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
