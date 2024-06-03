"use strict";

const debug  = require('debug');
const Events = require('eventemitter-async');
const net    = require('net');
const tls    = require('tls');

const {socketwrap, override}  = require('socketwrap');

const forIn  = require('mout/object/forIn');
const merge  = require('mout/object/merge');
const defer  = require('nyks/promise/defer');

const Client = require('./client.js');


const log = {
  info  : debug('ubk:server:info'),
  error : debug('ubk:server:error'),
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
      use_socketwrap : false,
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
        return client.disconnect(`failed ping challenge ${client.client_key}`);
      }

      // Send ping
      client.ping_failure = true;
      client.send('base', 'ping').then(function (response) {
        client.ping_failure = !(response == 'pong');
      }).catch(() => {});
    });
  }

  // Build new client from tcp stream
  async new_tcp_client(stream) {
    try {
      if(this.options.use_socketwrap) {
        stream.on('error', (err) => {debug(err);});
        let {remoteAddress, remotePort} = await socketwrap(stream);
        override(stream, {remoteAddress, remotePort});
      }
      log.info("Incoming tcp stream");
      var client = new Client('tcp', stream);
      client.once('received_cmd', this.register_client);
    } catch(err) {
      log.error(err);
    }
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

      await this.validate_device(client, args);

      let connected = true, reset = () => connected = false;
      client.once('disconnected', reset);
      client.respond(query, 'ok'); //respond may disconnect client
      client.off('disconnected', reset);

      if(!connected)
        throw `client disconnected`;

      // Save client
      this._clientsList[client.client_key] = client;
      client.once('disconnected', this.lost_client);
      client.on('received_cmd', this._onMessage.bind(this));

      // THAT'S GREAT, LET'S NOTIFY EVERYBOOOOODYYYY
      client.emit('registered', args).catch(this.emit.bind(this, 'error'));
      this.emit('registered_device', client, args).catch(this.emit.bind(this, 'error'));
      if(this.options.broadcasting_registration)
        this.broadcast('base', 'registered_client', client.export_json());

    } catch(err) {
      var message = (typeof err == 'string') ? err : (err.message ? err.message : `Error on server client registration`);
      try {
        client.respond(query, null, message);
      } catch(err) {}
      client.disconnect(message);
    }

  }

  async validate_device() {
    return true;
  }


  lost_client(client) {
    // Remove from list
    log.info("Lost client", client.client_key);
    delete this._clientsList[client.client_key];
    this.emit('unregistered_device', client).catch(this.emit.bind(this, 'error'));
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


  register_client_rpc(ns, cmd, callback, ctx) {

    this.register_cmd(ns, cmd, async function(client, query) {
      var response;
      var error;
      try {
        var args = [query.args].concat(query.xargs || []);
        response = await callback.apply(this, [{client}, ...args]);
      } catch(err) {error = (typeof err == 'string') ? err : (err.message ? err.message : `Something goes wrong`);}

      client.respond(query, response, error);
    }, ctx);
  }


  register_rpc(ns, cmd, callback, ctx) {

    this._rpcs[evtmsk(ns, cmd, 'rpc')] = {callback, ctx};

    this.register_cmd(ns, cmd, async function(client, query) {
      var response;
      var error;
      try {
        var args = [query.args].concat(query.xargs || []);
        response = await callback.apply(this, args);
      } catch(err) {error = (typeof err == 'string') ? err : (err.message ? err.message : `Something goes wrong`);}

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
      } catch(err) {error = (typeof err == 'string') ? err : (err.message ? err.message : `Something goes wrong`);}
      return client.respond(data, response, error);
    }

    var ns  = target.ns;
    var cmd = data.cmd;
    this.emit(evtmsk(ns, cmd), client, data).catch(this.emit.bind(this, 'error'));
  }

  broadcast(ns, cmd, payload) {
    var args = arguments;
    log.info("BROADCASTING", ns, cmd);

    forIn(this._clientsList, function(client) {
      client.signal.apply(client, args);
    });

    this.emit(`${ns}:${cmd}`, payload).catch(this.emit.bind(this, 'error'));
  }

}


module.exports = Server;
