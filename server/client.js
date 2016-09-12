"use strict";


const Class   = require('uclass');
const guid    = require('mout/random/guid');
const defer   = require('nyks/promise/defer');
const Events  = require('eventemitter-co');
const debug   = require('debug');

const TCPTransport = require('./transport/tcp');
const WSTransport  = require('./transport/ws');


var Client = module.exports = new Class({
  Implements : [Events],

  Binds : [ 'receive', 'disconnect'],

  // Identification
  client_key        : null,
  registration_time : null,

  // Network : tcp or websocket
  transport : null,

  // Commands sent
  _call_stack : {},

  log : {
    info  : debug("server:client"),
    error : debug("server:client")
  },

  initialize : function(type, stream) {
    var self = this;

    if(type == "ws")
      this.transport  = new WSTransport(stream);

    if(type == "tcp")
      this.transport = new TCPTransport(stream);

    this.transport.once("transport_disconnect", this.disconnected, this);
    this.transport.on("transport_message",    this.receive);

    var registrationTimeout = setTimeout( () => {
      this.log.info('Client registration timeout');
      this.disconnect();
    }, 5000);

    this.once("registered", () => {
      clearTimeout(registrationTimeout);
      this.registration_time  = Date.now();
    });
  },


  // Export client configuration
  export_json : function() {
    return {
      client_key    : this.client_key,
      registration_time : Math.floor(this.registration_time/1000),
      uptime: Math.floor((Date.now() - this.registration_time) / 1000),
      remoteAddress : this.transport.export_json(),
    };
  },


  // React to received data
  receive : function(data) {
    // Debug
    this.log.info("Received ", data, " from client", this.client_key);

    var callback = this._call_stack[data.quid];
    if(callback) {
      callback.promise.chain(null, data.response);
      delete this._call_stack[data.quid];
      return;
    }

    this.emit('received_cmd', this, data);
  },

  signal : function(ns, cmd, args) {
    var query = {ns, cmd, args };
    this.write(query);
  },


  send : function(ns, cmd/*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2),
      args  = xargs.shift();

    var promise = defer();
    var quid = guid();
    var query = {ns, cmd, quid, args, xargs };

    this._call_stack[quid] = { ns, cmd, promise };

    if(!(query.ns == 'base' && query.cmd == 'ping'))
      this.log.info("Send msg '%s:%s' to %s ", query.ns, query.cmd, this.client_key);

    this.write(query);
    return promise;
  },


  // Low Level send raw JSON
  respond: function(query, response, error){
    if(!(query.ns == 'base' && query.cmd == 'ping'))
      this.log.info("Responding msg '%s:%s' to %s ", query.ns, query.cmd, this.client_key);

    query.response = response;
    query.error    = error;

    delete query.cmd;
    delete query.ns;
    delete query.xargs;
    delete query.args;
    this.write(query);
  },

  write : function(query) {
    this.transport.write(query);
  },

  disconnect : function(reason) {
    this.transport.disconnect(reason);
  },

  disconnected : function(reason) {
    this.log.info("Client %s disconnected (%s)", this.client_key, reason);
    this.emit('disconnected', this);
  },

});
