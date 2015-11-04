var tls   = require('tls'),
    util  = require('util'),
    net   = require('net');

var Class   = require('uclass');
var Options = require('uclass/options');
var Client  = require('./client.js');
var clientWs= require('./clientWs.js');
var each    = require('mout/object/forOwn');
var merge   = require('mout/object/merge');
var wsServer= require('ws').Server
var http    = require('http');
var cmdsDispatcher = require('../lib/cmdsDispatcher')

var Server = module.exports = new Class({
  Implements : [ require("uclass/events"), Options, cmdsDispatcher],


  Binds : [
    'start',
    'heartbeat',
    'build_tls_server',
    'build_net_server',
    'start_socket_server',
    'new_tcp_client',
    'new_websocket_client',
    'get_client',

    'register_client',
    'lost_client',
    'call',
  ],

  _clientsList : {},
  _clientHeartBeat : null,

  options : {
    'secured'       : false,
    'server_port'   : 8000,
    'socket_port'   : 8001,
    'heartbeat_interval' : 1000 * 10,
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

  get_client : function(client_key){
    return this._clientsList[client_key];
  },

  start_socket_server : function(chain){
    var self = this;
    var web_sockets = new wsServer({
      server: http.createServer().listen(self.options.socket_port, chain),
      path : '/',
    });
    web_sockets.on('connection', this.new_websocket_client);
  },


  start : function(chain) {
    var self = this,
        server_port = this.options.server_port;

    this._clientHeartBeat = setInterval(this.heartbeat,  this.options.heartbeat_interval);

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
    var client = new Client(stream, this.register_client);
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this._dispatch);
  },

  // Build new client from web socket stream
  new_websocket_client : function(stream){
    var client = new clientWs(stream, this.lost_client);
    client.on('received_cmd', this._dispatch);
    this.register_client(client, function(){}); // direct register, we are connected !
  },

  // Register an active client, with id
  // Used by new_tcp_client

  register_client : function(client, chain){

    // Check id
    if(!client.client_key){
      client.disconnect();
      return chain("No id for client to register");
    }

    // Avoid conflicts
    if(this._clientsList[client.client_key]){
      client.disconnect();
      return chain("TCP client "+client.client_key +" already exists, sorry");
    }

    // Save client
    this._clientsList[client.client_key] = client;

    // Propagate

    this.broadcast('base', 'registered_client', client.export_json());

    chain();
  },

  lost_client : function(client){
    // Remove from list
    console.log("Lost client");
    delete this._clientsList[client.client_key];
    this.broadcast('base', 'unregistered_client', {client_key : client.client_key });

  },


  broadcast:function(ns, cmd, payload){
  console.log("BROADCASTING ", ns, cmd);
    each(this._clientsList, function(client){
      client.send(ns, cmd, payload);
    });

    this.emit(util.format("%s:%s", ns, cmd), payload);
  },

});
