var Class   = require('uclass');
var WsTransport = require('./transport/ws.js');
var guid    = require('mout/random/guid');


var Client = module.exports = new Class({
  Implements : [require("uclass/events")],
  Binds : [
    'receive',
    'register',
    'disconnect',
    'send',
    'call_rpc',
    'write',
  ],

  // Identification
  client_key : null,
  registration_time : null,

  // Network : tcp or websocket
  network_client : null,

  // Commands sent
  call_stack : {},

  log : console,

  initialize : function(stream, disconnected){
    var self = this;

    this.network_client = new WsTransport(stream, this.receive ,function(){
                                              disconnected(self)
                                            });

    this.client_key = this.network_client.id ;
  },


  // Export client configuration
  export_json : function(){
    return {
      client_key    : this.client_key,
      registration_time : Math.floor(this.registration_time/1000),
      uptime: Math.floor((Date.now() - this.registration_time) / 1000),
        //networkclient is canceled on disconnected clients
      remoteAddress : this.network_client ? this.network_client.export_json() : {},
    };
  },



  // React to received data
  receive : function(data){

    // Debug
    console.log("Received ", data, " from client", this.client_key);

    // Use stored callback from call stack
    if(data.quid in this.call_stack) {
      this.call_stack[data.quid](data.response, data.error);
      delete this.call_stack[data.quid];
      return;
    }

    // When no local action is found
    // Send to clients manager
    this.emit('received_cmd', this, data);
  },


  call_rpc : function(ns, cmd, args, callback){
    this.send(ns, cmd, args, function(response, error){
      callback.call(null, error, response);
    });
  },

  // Send a command to client, callback is not mandatory for signals
  send : function(ns, cmd, args, callback){
    if(!(ns == 'base' && cmd == 'ping'))
      console.log("Send msg '%s:%s' to %s ", ns, cmd, this.client_key);

    var quid = guid();

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
    if(!this.network_client)
      return;
    this.network_client.send(data);
  },


  // Low Level send raw JSON
  respond: function(query, response){
    if(!this.network_client)
      return;
    query.response = response;
    delete query.args;
    this.network_client.send(query);
  },

  // Network client got disconnected, propagate
  disconnect : function(){
    if(!this.network_client)
      return;

    var client = this.network_client;
    client.disconnect();
  },


});
