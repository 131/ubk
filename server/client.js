var Class   = require('uclass');
var TCPTransport = require('./transport/tcp.js');


var Client = module.exports = new Class({
  Implements : [require("events").EventEmitter],
  Binds : [
    'receive',
    'register',
    'disconnect',
    'send',
    'write',
  ],

  // Identification
  client_key : null,

  // Network : tcp or websocket
  network_client : null,

  // Commands sent
  call_stack : {},

  initialize : function(stream){
    var self = this;
    this.network_client = new TCPTransport(stream, this.receive, this.disconnect);

    // Auto disconnect on timeout of 5s.
    var timeout = setTimeout(function(c) {
      console.log('Client timeout');
      if(self.network_client)
        self.network_client.disconnect();
    }, 5000);
    this.once('registered', function() { clearTimeout(timeout) })

  },


  // Export client configuration
  export_json : function(){
    return {
      client_key    : this.client_key,
      remoteAddress : this.network_client.export_json(),
    };
  },

  register : function(data) {
    this.client_key = data.args.client_key;
    if(!this.client_key){
      console.log("Missing client key", data);
      return;
    }

    // Check SSL client cert matches
    var exp = this.network_client.export_json();
    if(exp.secured && exp.name != this.client_key){
      console.log("The cert ("+exp.name+") does NOT match the given id "+this.client_key);
      return;
    }

    this.emit('registered', this);
  },


  // React to received data
  receive : function(data){

    // Got new client id
    if( data.ns == 'base' && data.cmd == 'register'){
      return this.register(data);
    }

    // Use stored callback from call stack
    if(data.quid in this.call_stack) {
      this.call_stack[data.quid](data.response);
      delete this.call_stack[data.quid];
      return;
    }

    // Debug
    console.log("Client "+this.client_key+" received : ");
    console.log(data);

    // When no local action is found
    // Send to clients manager
    this.emit('received_cmd', [this, data]);
  },

  // Send a command to client, callback is not mandatory for signals
  send : function(ns, cmd, args, callback){
    if(!(ns == 'base' && cmd == 'ping'))
      console.log("Send msg '%s:%s' to %s ", cmd, ns, this.client_key);

    var quid = String.uniqueID();

    var query = {
      ns : ns,
      cmd : cmd,
      quid : quid,
      args : args
    };

    if(callback)
      this.call_stack[quid] = callback;
    this.write(query);
  },

  // Low Level send raw JSON
  write : function(data){
    this.network_client.send(data);
  },


  // Low Level send raw JSON
  respond: function(query, response){
    query.response = response;
    delete query.args;
    this.network_client.send(query);
  },


  // Network client got disconnected, propagate
  disconnect : function(){
    if(!this.network_client)
      return;

    var client = this.network_client;
    this.network_client = null;
    client.disconnect();

    this.emit('disconnected', this);
    console.log("Client %s disconnected", this.client_key);
  },


});
