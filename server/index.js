var tls   = require('tls'),
    util  = require('util'),
    net   = require('net');

var Class   = require('uclass');
var Options = require('uclass/options');
var Client  = require('./client.js');
var each    = require('mout/object/forOwn');



var Server = module.exports = new Class({
  Implements : [ require("events").EventEmitter, Options],

  Binds : [
    'start',
    'heartbeat',
    'build_tls_server',
    'build_net_server',
    'new_tcp_client',
    'new_websocket_client',
    'register_client',
    'register_cmd',
    'received_cmd',
    'lost_client',
  ],

  _clientsList : {},
  _clientHeartBeat : null,

  options : {
    'secured'       : false,
    'server_port'   : 8000,
  },



  initialize:function(options) {

    this.setOptions(options);


    if(this.options.secured) {
      var tls_options = {
          requestCert: true,
          rejectUnauthorized : true,
          key :  null,
          cert : null,
          ca : [ null ]
      };
      this.tcp_server = tls.createServer(tls_options, this.new_tcp_client);
    } else {
      this.tcp_server = net.createServer(this.new_tcp_client);
    }

  },

  start : function(chain) {
    var self = this,
        server_port = this.options.server_port;

    this._clientHeartBeat = setInterval(this.heartbeat, 1000 * 2.5);

    console.log("Server is in %s mode", this.options.secured ? "SECURED" : "NON SECURED");
  
    this.tcp_server.listen(server_port, function(){
      console.log("Started TCP server for clients on port %d", server_port);
      chain();
    });
  },

  heartbeat:function(){

    each(this._clientsList, function(client){
      // Check failures
      if(client.ping_failure) {
        console.log("client " + client.client_key + " failed ping challenge, assume disconnected");
        return client.disconnect();
      }

      // Send ping
      client.ping_failure = true;
      client.send('base', 'ping', {}, function(response){
        client.ping_failure = false;
      });
    });
  },



  // Build new client from tcp stream
  new_tcp_client : function(stream){
    var client = new Client(stream);
    client.once('registered', this.register_client);
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this.received_cmd);
  },

  // Build new client from web socket stream
  new_websocket_client : function(stream){
    var client = new Client('websocket', stream);
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this.received_cmd);
    this.register_client(client); // direct register, we are connected !
  },

  // Register an active client, with id
  // Used by new_tcp_client
  register_client : function(client){
    // Check id
    if(!client.client_key){
      console.log("No id for client to register");
      client.disconnect();
      return;
    }

    // Avoid conflicts
    if(this._clientsList[client.client_key]){
      console.log("TCP client "+client.client_key +" already exists, sorry");
      client.disconnect();
      return;
    }

    // Save client
    this._clientsList[client.client_key] = client;

    // Propagate
    this.broadcast('base', 'registered_client', client.export_json());
  },

  lost_client : function(client){
    // Remove from list
    delete this._clientsList[client.client_key];
    this.broadcast('base', 'unregistered_client', {client_key : client.client_key });

  },

  // Register a cmd for a namespace
  register_cmd : function(namespace, cmd, callback){
    console.log('Register '+namespace+'.'+cmd);
    if(!this.namespaces[namespace])
      this.namespaces[namespace] = {};
    if(this.namespaces[namespace][cmd])
      throw new Error("Already registered "+namespace+'.'+cmd);
    this.namespaces[namespace][cmd] = callback;
  },

  // Apply a registered command
  received_cmd : function(client, data){
    try{
      if(!data)
        throw new Error("No data.");
      if(!this.namespaces[data.ns])
        throw new Error("No namespace "+data.ns);
      var callback = this.namespaces[data.ns][data.cmd];
      if(!callback)
        throw new Error("No cmd "+data.cmd+" in namespace "+data.ns);
      callback(client, data);
    }catch(e){
      console.log("Failed callback for cmd: "+e);
    }
  },

  broadcast:function(ns, cmd, payload){
  console.log("BROADCASTING ", ns, cmd);
    each(this._clientsList, function(client){
      client.send(ns, cmd, payload);
    });

    this.emit(util.format("%s:%s", ns, cmd), payload);
  },

});