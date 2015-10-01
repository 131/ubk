var HermesClient = new Class({
  Binds : [
    'receive',
    'send',
  ],
  url : '',
  socket : null,
  namespaces : {},
  call_stack : {},

  initialize : function(url, chain) {
    this.url = url;
    this.socket = io.connect(this.url);
    this.socket.on('connect', chain);
    this.socket.on('message', this.receive);
  },

  register_namespace : function(namespace, callback) {
    if(this.namespaces[namespace])
      throw new Error("Already registered namespace " + namespace);
    this.namespaces[namespace] = callback;
  },

  // Received a message
  receive : function(data) {
    console.log(data);

    // Ping response
    if(data.ns == "base" && data.cmd == "ping") {
      data.response = "pong";
      this.socket.send(data);
    }

    // Local call stack
    if(this.call_stack[data.quid]) {
      this.call_stack[data.quid](data.response);
      delete this.call_stack[data.quid];
      return;
    }

    // Pass data to namespaces callback
    if(this.namespaces[data.ns]) {
      this.namespaces[data.ns](data);
    }

  },

  // Send a message, with full cmd stack
  send : function(namespace, cmd, args, callback) {
    var quid = String.uniqueID(),
        query = {
          ns : namespace,
          cmd : cmd,
          quid : quid,
          args : args
        };

    if(callback)
      this.call_stack[quid] = callback;

    this.socket.send(query);
  },

  // Helper to make a direct REST request to Hermes
  rest_request : function(path) {
    var url = this.url + path,
        out = null,
        request = new Request.JSON({
          async : false,
          url : url,
          onSuccess : function(value) { out = value;},
        });
    request.send();
    return out;
  }
});
