var Class   = require('uclass');
var TCPTransport = require('./transport/tcp.js');
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

  initialize : function(stream, registration){
    var self = this;
    this.network_client = new TCPTransport(stream, this.receive, this.disconnect);

    // Auto disconnect on timeout of 5s.
    var timeout = setTimeout(function(c) {
      console.log('Client timeout');
      if(self.network_client)
        self.network_client.disconnect();
    }, 5000);

    this.once("registered", function(){clearTimeout(timeout) ;});

    var once = false;
    this.registration = function(query){
      if(once || !registration) return; once  = true;
      self.registration_time  = Date.now();


      registration(self, function(err){
          if(err)
            return; //leaving the timeout to kill us
          self.respond(query, "ok");
          self.emit("registered");
      });
    }
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

  register : function(query) {

    if(!this.network_client)
      return; //leave the timeout to kill us

    this.client_key = query.args.client_key;
    // Check SSL client cert matches
    var exp = this.network_client.export_json();
    if(exp.secured && exp.name != this.client_key){
      this.log.info("The cert (%s) does NOT match the given id %s", exp.name, this.client_key);
      //leaving the initialize timeout to kill us
      return;
    }
    this.registration(query);
  },


  // React to received data
  receive : function(data){
    // Debug
    console.log("Received ", data, " from client", this.client_key);

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
  respond: function(query, response, error){
    if(!this.network_client)
      return;
    query.response = response;
    query.error    = error;
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
