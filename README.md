# uBk

micro message broker for v8.

# Key features
Exupery style.
(You will not make it any smaller or simplier)

# Usage example
## Server
```
var Server = require('ubk/server');
var server = new Server({server_port:6000});
server.connect();

```

## Client
```
var Client = require('ubk/client/tcp');
var client = new Client({server_port:6000});
client.connect();

```
