"use strict";

const tls   = require('tls');
const net   = require('net');
const debug = require('debug');


const Class   = require('uclass');
const Options = require('uclass/options');
const Client  = require('./client.js');
const each    = require('async-co/each');
const merge   = require('mout/object/merge');
const forIn   = require('mout/object/forIn');
const Events  = require('eventemitter-co');

const EVENT_SOMETHING_APPEND = "change_append";


const evtmsk = function(ns, cmd) {
  return `_${ns}:${cmd}`;
}

const Server = new Class({
  Implements : [ Events, Options],

  Binds : [
    'start',
    '_onMessage',

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
    'heartbeat_interval' : 1000 * 20,
  },

  log : {
    info : debug("server")
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

    this.register_rpc('base', 'ping', function *(){
      return Promise.resolve("pong");
    });

  },

  get_client : function(client_key){
    return this._clientsList[client_key];
  },


  start : function(chain) {
    var self = this;
    var server_port = this.options.server_port;

    this._clientHeartBeat = setInterval(this.heartbeat,  this.options.heartbeat_interval);

    this.log.info("Server is in %s mode", this.options.secured ? "SECURED" : "NON SECURED");

    this.tcp_server.listen(server_port, function() {
      self.log.info("Started TCP server for clients on port %d", server_port);
      chain();
    });
  },

  heartbeat: function() {
    var self = this;

    forIn(this._clientsList, function(client) {
      // Check failures
      if(client.ping_failure) {
        self.log.info("client " + client.client_key + " failed ping challenge, assume disconnected");
        return client.disconnect();
      }

      // Send ping
      client.ping_failure = true;
      client.send('base', 'ping').then(function(response) {
        client.ping_failure = (response == "pong");
      });
    });
  },


  // Build new client from tcp stream
  new_tcp_client : function(stream){
    var client = new Client('tcp', stream, this.register_client);
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this._onMessage);
  },

  // Build new client from web socket stream
  new_websocket_client : function(stream){
    var client = new client('ws', stream, null, this.lost_client);
    client.on('received_cmd', this._onMessage);
    this.register_client(client, function(){}); // direct register, we are connected !
  },

  // Register an active client, with id
  // Used by new_tcp_client

  register_client : function(client, chain) {

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


    this.broadcast('base', 'registered_client', client.export_json());
    chain();
  },

  lost_client : function(client){
    // Remove from list
    this.log.info("Lost client");
    delete this._clientsList[client.client_key];
    this.broadcast('base', 'unregistered_client', {client_key : client.client_key });
  },


  register_cmd : function(ns, cmd, callback) {
    this.off( evtmsk(ns, cmd) );
    this.on( evtmsk(ns, cmd) , callback);
  },

  register_rpc : function(ns, cmd, callback, ctx){
    var self = this;

    this.register_cmd(ns, cmd, function* (client, query) {
      var response, err;
      try {
        var args = [query.args].concat(query.xargs || []);
        response = yield callback.apply(ctx || this, args);
      } catch(error) { err = ""+ error; }

      client.respond(query, response, err);
    });
  },

  _onMessage : function(client, data){
    this.emit(evtmsk(data.ns, data.cmd), client, data);
    this.emit(EVENT_SOMETHING_APPEND, data.ns, data.cmd)
  },


  broadcast : function (ns, cmd, payload) {
    this.log.info("BROADCASTING ", ns, cmd);

    
    forIn(this._clientsList, function(client) {
      client.signal(ns, cmd, payload);
    });

    this.emit(`${ns}:${cmd}`, payload);
  },

});


module.exports = Server;