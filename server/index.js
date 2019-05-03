"use strict";

const debug  = require('debug');
const Events = require('eventemitter-co');
const net    = require('net');
const tls    = require('tls');

const forIn  = require('mout/object/forIn');
const merge  = require('mout/object/merge');
const defer  = require('nyks/promise/defer');

const Client = require('./client.js');

const EVENT_SOMETHING_APPEND = 'change_append';

const log = {
  info  : debug('ubk:server'),
  error : debug('ubk:server'),
};

const evtmsk = function(ns, cmd) {
  return `_${ns}:${cmd}`;
};

class Server extends Events {

  constructor(options) {
    super();
    this._clientsList     = {};
    this._rpcs            = {};
    this._clientHeartBeat = null;

    this.options = merge({
      secured       : false,
      server_port   : 8000,
      socket_port   : 8001,
      heartbeat_interval : 1000 * 20,
      broadcasting_registration : true,
      tls_options : {
        requestCert : true,
        rejectUnauthorized : true,
        key  :  null,
        cert : null,
        ca   : [null]
      }
    }, options);

    this.heartbeat            = this.heartbeat.bind(this);
    this.new_tcp_client       = this.new_tcp_client.bind(this);
    this.new_websocket_client = this.new_websocket_client.bind(this);
    this.get_client           = this.get_client.bind(this);
    this.register_client      = this.register_client.bind(this);
    this.lost_client          = this.lost_client.bind(this);
    this.call                 = this.call.bind(this);

    if(this.options.secured)
      this.tcp_server = tls.createServer(this.options.tls_options, this.new_tcp_client);
    else
      this.tcp_server = net.createServer(this.new_tcp_client);

    //... what else ?
    this.register_rpc('base', 'ping', () => 'pong');
    this.register_cmd('base', 'register', this.register_client);

  }

  async validate_sub_client() {
    return true; // to be overrided
  }

  get_client(client_key) {
    return this._clientsList[client_key];
  }

  start() { /*chain*/
    var args  = [].slice.apply(arguments);
    var chain = args.shift() || Function.prototype;

    var defered     = defer();
    var server_port = this.options.server_port;

    this._clientHeartBeat = setInterval(this.heartbeat,  this.options.heartbeat_interval);

    log.info("Server is in %s mode", this.options.secured ? "SECURED" : "NON SECURED");

    this.tcp_server.listen({port : server_port, host : '0.0.0.0'}, (err) => {
      this.options.server_port  =  this.tcp_server.address().port;
      log.info("Started TCP server for clients on port %d", this.options.server_port);
      defered.chain(err, this.options.server_port);
      chain();
    });

    return defered;
  }

  heartbeat() {
    forIn (this._clientsList, (client) => {
      // Check failures
      if(client.ping_failure) {
        log.info("client %s failed ping challenge, assume disconnected", client.client_key);
        return client.disconnect();
      }

      // Send ping
      client.ping_failure = true;
      client.send('base', 'ping').then(function (response) {
        client.ping_failure = !(response == 'pong');
      });
    });
  }

  // Build new client from tcp stream
  new_tcp_client(stream) {
    log.info("Incoming tcp stream");
    var client = new Client('tcp', stream);
    client.once('received_cmd', this.register_client);
  }

  // Build new client from web socket stream
  new_websocket_client(stream) {
    log.info("Incoming ws stream");
    var client = new Client('ws', stream);
    client.once('received_cmd', this.register_client);
  }

  async register_client(client, query) {
    try {
      var args = query.args;
      //can only register once...
      if(query.ns != 'base' || query.cmd != 'register')
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
      if(typeof query == 'object')
        client.respond(query, null, err);
      return client.disconnect();
    }

    // Save client
    this._clientsList[client.client_key] = client;

    client.respond(query, 'ok');
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this._onMessage.bind(this));

    // THAT'S GREAT, LET'S NOTIFY EVERYBOOOOODYYYY
    client.emit('registered', args).catch(log.error);
    this.emit('registered_device', client, args).catch(log.error);
    if(this.options.broadcasting_registration)
      this.broadcast('base', 'registered_client', client.export_json());
  }


  lost_client(client) {
    // Remove from list
    log.info("Lost client", client.client_key);
    delete this._clientsList[client.client_key];
    this.emit('unregistered_device', client).catch(log.error);
    if(this.options.broadcasting_registration)
      this.broadcast('base', 'unregistered_client', {client_key : client.client_key });
  }

  unregister_cmd(ns, cmd) {
    this.off(evtmsk(ns, cmd));
  }

  register_cmd(ns, cmd, callback, ctx) {
    this.off(evtmsk(ns, cmd));
    this.on(evtmsk(ns, cmd), callback, ctx);
  }

  async call(ns, cmd) {
    var args = [].slice.call(arguments, 2);
    var proc = this._rpcs[evtmsk(ns, cmd, 'rpc')];
    if(!proc)
      throw "Invalid rpc command";
    return await proc.callback.apply(proc.ctx || this, args);
  }

  register_rpc(ns, cmd, callback, ctx) {

    this._rpcs[evtmsk(ns, cmd, 'rpc')] = {callback, ctx};

    this.register_cmd(ns, cmd, async function(client, query) {
      var response;
      var error;
      try {
        var args = [query.args].concat(query.xargs || []);
        response = await callback.apply(this, args);
      } catch(err) { error = '' + err; }

      client.respond(query, response, error);
    }, ctx);
  }

  async _onMessage(client, data) {
    var target = data.ns;
    if(typeof target == 'string') {
      let tmp = target.split(':'); //legacy ns:device_key syntax
      target = { ns : tmp[0], client_key : tmp[1] };
    }
    if(target.client_key) { //proxy
      var response;
      var error;
      if(target.client_key == "*") {
        this.broadcast(...[target.ns, data.cmd, data.args].concat(data.xargs));
        return client.respond(data, 'done');
      }
      log.info("proxy %s from %s to %s", data, client.client_key, target.client_key);
      var remote = this._clientsList[target.client_key];
      try {
        if(!remote)
          throw `Bad client '${target.client_key}'`;
        response = await remote.send(...[target.ns, data.cmd, data.args].concat(data.xargs));
      } catch(err) {
        error = err;
      }
      return client.respond(data, response, error);
    }

    var ns  = target.ns;
    var cmd = data.cmd;
    this.emit(evtmsk(ns, cmd), client, data)
      .then(() => {
        this.emit(EVENT_SOMETHING_APPEND, ns, cmd).catch(log.error);
      })
      .catch(log.error);
  }

  broadcast(ns, cmd, payload) {
    var args = arguments;
    log.info("BROADCASTING", ns, cmd);

    forIn(this._clientsList, function(client) {
      client.signal.apply(client, args);
    });

    this.emit(`${ns}:${cmd}`, payload).catch(log.error);
  }

}


module.exports = Server;
