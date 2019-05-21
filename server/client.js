"use strict";

const debug   = require('debug');
const Events  = require('eventemitter-co');

const guid    = require('mout/random/guid');
const defer   = require('nyks/promise/defer');

const TCPTransport = require('./transport/tcp');
const WSTransport  = require('./transport/ws');

const log = {
  info  : debug('ubk:server:client:info'),
  error : debug('ubk:server:client:error'),
  ping  : debug('ubk:server:ping')
};

class Client extends Events {

  constructor(type, stream) {
    super();

    // Identification
    this.client_key        = null;
    this.registration_time = null;

    // Network : tcp or websocket
    this.transport = null;

    // Commands sent
    this._call_stack  = {};

    if(type == 'ws')
      this.transport  = new WSTransport(stream);

    if(type == 'tcp')
      this.transport = new TCPTransport(stream);

    this.type = type;
    this.transport.once('transport_disconnect', this.disconnected, this);
    this.transport.on('transport_message',    this.receive, this);

    var registrationTimeout = setTimeout(() => {
      log.info('Client registration timeout');
      this.disconnect('timeout');
    }, 5000);

    this.once('registered', () => {
      clearTimeout(registrationTimeout);
      this.registration_time  = Date.now();
    });
  }

  // Export client configuration
  export_json() {
    return {
      client_key        : this.client_key,
      registration_time : Math.floor(this.registration_time / 1000),
      uptime            : Math.floor((Date.now() - this.registration_time) / 1000),
      remoteAddress     : this.transport.export_json()
    };
  }

  // React to received data
  receive(data) {
    // Debug
    if(((data.ns == 'base') && (data.cmd == 'ping')) || (data.response == 'pong'))
      log.ping("Received", data, "from client", this.client_key);
    else
      log.info("Received", data, "from client", this.client_key);

    var callback = this._call_stack[data.quid];
    if(callback) {
      callback.promise.chain(data.error, data.response);
      delete this._call_stack[data.quid];
      return;
    }
    this.emit('received_cmd', this, data).catch(log.error);
  }

  signal(ns, cmd/*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2);
    var args  = xargs.shift();
    var query = {ns, cmd, args, xargs};

    try {
      this.write(query);
    } catch(err) {
      log.error("can't write in the socket", err);
    }
  }

  send(ns, cmd/*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2);
    var args  = xargs.shift();

    var promise = defer();
    var quid    = guid();
    var query   = {ns, cmd, quid, args, xargs };

    this._call_stack[quid] = { ns, cmd, promise };

    if(!(query.ns == 'base' && query.cmd == 'ping'))
      log.info("Send msg '%s:%s' to %s", query.ns, query.cmd, this.client_key);

    try {
      this.write(query);
    } catch(err) {
      log.error("can't write in the socket", err);
      promise.reject(err);
    }

    return promise;
  }

  // Low Level send raw JSON
  respond(query, response, error) {
    if(!(query.ns == 'base' && query.cmd == 'ping'))
      log.info("Responding msg '%s:%s' to %s ", query.ns, query.cmd, this.client_key);

    query.response = response;
    query.error    = error;

    delete query.cmd;
    delete query.ns;
    delete query.xargs;
    delete query.args;

    this.write(query);
  }

  write(query) {
    this.transport.write(query);
  }

  disconnect(reason) {
    this.transport.disconnect(reason);
  }

  disconnected(reason) {
    log.info("Client %s disconnected (%s)", this.client_key, reason);
    this.emit('disconnected', this).catch(log.error);
  }

}

module.exports = Client;
