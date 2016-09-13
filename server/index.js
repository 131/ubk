"use strict";

const tls   = require('tls');
const net   = require('net');
const debug = require('debug');


const Class   = require('uclass');
const Options = require('uclass/options');
const Client  = require('./client.js');
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
    'tls_options' : {
      'requestCert': true,
      'rejectUnauthorized' : true,
      'key' :  null,
      'cert' : null,
      'ca' : [ null ]
    }
  },

  log : {
    info  : debug("ubk:server"),
    error : debug("ubk:server"),
  },

  initialize:function(options) {

    this.setOptions(options);
    
    if(this.options.secured) {
      this.tcp_server = tls.createServer(this.options.tls_options, this.new_tcp_client);
    } else {
      this.tcp_server = net.createServer(this.new_tcp_client);
    }

    this.register_rpc('base', 'ping', function *(){
      return Promise.resolve("pong");
    });

    this.register_cmd('base', 'register', this.register_client);
  },

  get_client : function(client_key){
    return this._clientsList[client_key];
  },


  start : function(chain) {
    var self = this;
    var server_port = this.options.server_port;

    this._clientHeartBeat = setInterval(this.heartbeat,  this.options.heartbeat_interval);

    this.log.info("Server is in %s mode", this.options.secured ? "SECURED" : "NON SECURED");

    this.tcp_server.listen({port:server_port, host:'0.0.0.0'}, function() {
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
  new_tcp_client : function(stream) {
    this.log.info("Incoming tcp stream");
    var client = new Client('tcp', stream);
    client.once('received_cmd', this.register_client);
  },

  // Build new client from web socket stream
  new_websocket_client : function(stream) {
    this.log.info("Incoming ws stream");
    var client = new Client('ws', stream);
    client.once('received_cmd', this.register_client);
  },


  register_client : function* (client, query) {

    try {
      var args = query.args;
        //can only register once...
      if(query.ns != "base" || query.cmd != "register")
        throw `Un-expected registration query`;

      if(client.client_key)
        throw `Already registered client '${client.client_key}'`;

      client.client_key = args.client_key;
      // Check SSL client cert matches
      var exp = client.export_json();

      if(exp.secured && exp.name != client.client_key)
        throw `The cert '${exp.name}' does NOT match the given id '${client.client_key}'`;

      if(!client.client_key)
        throw `No id for client to register`;

      // Avoid conflicts
      if(this._clientsList[client.client_key])
        throw `Client '${client.client_key}' already exists, sorry`;
    } catch(err) {
      if(typeof query == "object")
        client.respond(query, null, err);
      return client.disconnect();
    }

    // Save client
    this._clientsList[client.client_key] = client;

    client.respond(query, "ok");
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this._onMessage);

      // THAT'S GREAT, LET'S NOTIFY EVERYBOOOOODYYYY
    client.emit("registered", args).catch(this.log.error);
    this.emit('registered_device', client, args).catch(this.log.error);
    this.broadcast('base', 'registered_client', client.export_json());
 },


  lost_client : function(client){
    // Remove from list
    this.log.info("Lost client");
    delete this._clientsList[client.client_key];

    this.emit('unregistered_device', client).catch(this.log.error);
    this.broadcast('base', 'unregistered_client', {client_key : client.client_key });
  },

  unregister_cmd : function(ns, cmd) {
    this.off( evtmsk(ns, cmd) );
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

  _onMessage : function* (client, data) {
    var fullns = data.ns.split(":");

    data.client_key = fullns[1]; //allow ns:device_key syntax
    data.ns         = fullns[0]; //legacy behavior

    if(data.client_key) { //proxy
      this.log.info("proxy %s from %s to %s", data, client.client_key, data.client_key);
      var remote = this._clientsList[data.client_key], response, err;
      try {
        if(!remote)
            throw `Bad client '${data.client_key}'`;
        response = yield remote.send.apply(remote, [data.ns, data.cmd, data.args].concat(data.xargs));
      } catch(error) {
        err = error;
      }
      return client.respond(data, response, err);
    }

    this.emit(evtmsk(data.ns, data.cmd), client, data).catch(this.log.error);
    this.emit(EVENT_SOMETHING_APPEND, data.ns, data.cmd).catch(this.log.error);
  },


  broadcast : function (ns, cmd, payload) {
    this.log.info("BROADCASTING ", ns, cmd);

    forIn(this._clientsList, function(client) {
      client.signal(ns, cmd, payload);
    });

    this.emit(`${ns}:${cmd}`, payload).catch(this.log.error);
  },

});


module.exports = Server;