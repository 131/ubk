"use strict";


const Class   = require('uclass');
const guid    = require('mout/random/guid');
const defer   = require('nyks/promise/defer');
const Events  = require('eventemitter-co');
const debug   = require('debug');

const TCPTransport = require('./transport/tcp');
const WSTransport  = require('./transport/ws');
const SubClient    = require('./subClient');

const logPing = debug("ubk:server:ping")


var Client = module.exports = new Class({
  Implements : [Events],

  Binds : [ 'receive', 'disconnect'],

  // Identification
  client_key        : null,
  registration_time : null,

  // Network : tcp or websocket
  transport : null,

  // Commands sent
  _call_stack  : {},
  _sub_clients : {},

  log : {
    info  : debug("ubk:server:client"),
    error : debug("ubk:server:client")
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
      this.disconnect("timeout");
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
      sub_client_list : Object.keys(this._sub_clients)
    };
  },


  // React to received data
  receive : function(data) {
    // Debug
    
    if(( (data.ns == 'base') && (data.cmd == 'ping') ) || (data.response == 'pong') ){
      logPing("Received ", data, " from client", this.client_key);
    }else {
      this.log.info("Received ", data, " from client", this.client_key);
    }

    var callback = this._call_stack[data.quid];
    if(callback) {
      callback.promise.chain(data.error, data.response);
      delete this._call_stack[data.quid];
      return;
    }

    var remote         = this;
    if(data.ns){
      var sub_client_key = data.ns.split("*")[1];
      data.ns = data.ns.split("*")[0];

      if(sub_client_key && this._sub_clients[sub_client_key]){
       remote = this._sub_clients[sub_client_key];
      }
    }
    this.emit('received_cmd', remote, data).catch(this.log.error);
  },

  signal : function(ns, cmd, args) {
    var query = {ns, cmd, args };
    try{
      this.write(query);
    }catch(err){
      this.log.error("can't write in the socket" , err);
      promise.reject(err);
    }
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

    try{
      this.write(query);
    }catch(err){
      this.log.error("can't write in the socket" , err);
      promise.reject(err);
    }

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
    try{
      this.write(query);
    }catch(err){
      this.log.error("can't write in the socket" , err);
    }
  },

  write : function(query) {
    this.transport.write(query);
  },

  disconnect : function(reason) {
    this.transport.disconnect(reason);
  },

  disconnected : function(reason) {
    this.log.info("Client %s disconnected (%s)", this.client_key, reason);
    this.emit('disconnected', this).catch(this.log.error);
  },

  add_sub_client : function(client_key){
    if(this._sub_clients[client_key])
      return this._sub_clients[client_key];
    this._sub_clients[client_key] = new SubClient(this, client_key);
    this.log.info("sub client %s connect ", client_key, reason);
  },

  remove_sub_client : function(client_key){
    this.log.info("sub client %s disconnected ", client_key, reason);
    delete this._sub_clients[client_key]
  },



});
