# ubk
High performance, micro [JSON streaming](https://en.wikipedia.org/wiki/JSON_Streaming) message broker for v8.
[ubk](https://github.com/131/ubk) use ES8 async/await design (backed on [co/eventemitter-co](https://github.com/131/eventemitter-co)


[![Build Status](https://travis-ci.org/131/ubk.svg?branch=master)](https://travis-ci.org/131/ubk)
[![Coverage Status](https://coveralls.io/repos/github/131/ubk/badge.svg?branch=master)](https://coveralls.io/github/131/ubk?branch=master)
[![Version](https://img.shields.io/npm/v/ubk.svg)](https://www.npmjs.com/package/ubk)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)


# Key features
* Exupery style. (You will not make it any smaller or simplier)
* Broker support application (backend) 
* pub/sub pattern
* RCP support (asynchronious procedure calls)
* Reflection API (list connected clients)



## Server API
 * Server implement EventEmitter API.
`.register_cmd(ns, command, callback)`
  subscribe for a specific message in NS, callback is callback(client, query)

`.broadcast(ns, cmd, payload)`
  * send a payload message to all connected clients
  * emit local event "ns:cmd" 

### Events
  Broadcast messages are forwarded into the EventEmitter dispatcher
  * "base:registered_client"
  * "base:unregistered_client"


### Base (internal) messages
  "base:ping" , send periodicaly to all client to check for a living connection
    *payload : none
  "base:registered_client", broadcasted to all client on new client registration
    *payload : client
  "base:unregistered_client", broadcasted to all clients on client disconnection
    *payload : client


