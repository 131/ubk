# ubk
micro message broker for v8.

# Key features
Exupery style. (You will not make it any smaller or simplier)

* Broker support application (backend) 
* pub/sub pattern
* RCP support (asynchronious procedure calls)
* Reflection API (list connected clients)


# Usage example
* See minimal RPC sample here : https://github.com/131/ubk-tests


## Server API
 * Server implement EventEmitter API.

.register_cmd(ns, command, callback)
  subscribe for a specific message in NS, callback is callback(client, query)

.broadcast(ns, cmd, payload)
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
