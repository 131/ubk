"use strict";


const Class   = require('uclass');
const guid    = require('mout/random/guid');
const defer   = require('nyks/promise/defer');
const Events  = require('eventemitter-co');
const debug   = require('debug');

const TCPTransport = require('./transport/tcp.js');
const WSTransport  = require('./transport/ws.js');


var Client = module.exports = new Class({
  Implements : [Events],

  Binds : [ 'receive', 'disconnect'],

  // Identification
  client_key        : null,
  registration_time : null,

  // Network : tcp or websocket
  network_client : null,

  // Commands sent
  _call_stack : {},

  log : {
    info  : debug("server:client"),
    error : debug("server:client")
  },

  initialize : function(type, stream, chainConnect, chainDisconnect){
    var self = this;

    this.once("disconnected", chainDisconnect);

    if(type == "ws") {
      this.network_client = new WSTransport(stream, this.receive, this.disconnect);
      this.client_key     = this.network_client.id;
    }

    if(type == "tcp")
      this.network_client = new TCPTransport(stream, this.receive, this.disconnect);

    var registrationTimeout = setTimeout(function() {
      self.log.info('Client registration timeout');
      if(self.network_client)
        self.network_client.disconnect();
    }, 5000);

    this.once("registered", function(){ clearTimeout(registrationTimeout)});

    var once = false;
    this.registration = function(query){
      if(once || !chainConnect)
        return;
      once  = true;

      self.registration_time  = Date.now();

      chainConnect(self, function(err){
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
    this.log.info("Received ", data, " from client", this.client_key);

    // Got new client id
    if( data.ns == 'base' && data.cmd == 'register')
      return this.register(data);

    var callback = this._call_stack[data.quid];
    if(callback) {
      callback.promise.chain(null, data.response);
      delete this._call_stack[data.quid];
      return;
    }

    // When no local action is found
    // Send to clients manager
    this.emit('received_cmd', this, data);
  },

  signal : function(ns, cmd, args) {
    var query = {ns, cmd, args };
    this.write(query);
  },


  send : function(ns, cmd/*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2),
      args  = xargs.shift();

    if(!(ns == 'base' && cmd == 'ping'))
      this.log.info("Send msg '%s:%s' to %s ", ns, cmd, this.client_key);

    var promise = defer();
    var quid = guid();
    var query = {ns, cmd, quid, args, xargs };

    this._call_stack[quid] = { ns, cmd, promise };

    this.write(query);

    return promise;
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

    delete query.cmd;
    delete query.ns;
    delete query.xargs;
    delete query.args;

    this.network_client.send(query);
  },


  // Network client got disconnected, propagate
  disconnect : function(error) {

    this.log.error("Disconnecting", error);
    if(!this.network_client)
      return;

    var client = this.network_client;
    this.network_client = null;
    client.disconnect();

    this.emit('disconnected', this);
    this.log.info("Client %s disconnected", this.client_key);
  },


});
