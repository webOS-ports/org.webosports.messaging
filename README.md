org.webosports.messaging
========================

The Messaging app and service for Lune OS, built with Enyo2 and node.js

Description
-----------
The messaging app is one of the core applications of the operating system and allows you to
send and receive messages through various backend services (IM, SMS, ...).

## Contributing

If you want to contribute you can just start with cloning the repository and make your
contributions. We're using a pull-request based development and utilizing github for the
management of those. All developers must provide their contributions as pull-request and
github and at least one of the core developers needs to approve the pull-request before it
can be merged.

Please refer to http://www.webos-ports.org/wiki/Communications for information about how to
contact the developers of this project.


## Building & Installing App

You can develop in the browser like a normal Enyo 2 web app - 
Contacts will use the data in db8SourceMock.js and the mock directory.
You'll need node.js and enyo-dev: 
http://enyojs.com/docs/latest/developer-guide/getting-started/first-steps.html


After pulling this source code, start a bash shell, `cd` to the app directory, then run
`enyo init`
to pull in the dependencies.


To rebuild on any change (for developing in the browser), run this command once in the app directory:
`enyo pack --watch`

To test in a browswer (Chrome is most like LuneOS) surf to `dist/index.html`


To rebuild and install on a LuneOS device attached via USB, run this command in the app directory:
`enyo pack && adb push dist /usr/palm/applications/org.webosports.app.messaging && adb shell systemctl restart luna-next; adb forward tcp:1122 tcp:1122`
Then, in Chrome, surf to `localhost:1122` to debug.

