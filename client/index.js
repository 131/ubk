"use strict";

const debug   = require('debug');
const Events  = require('eventemitter-co');

const guid    = require('mout/random/guid');
const defer   = require('nyks/promise/defer');
const sleep   = require('nyks/function/sleep');


const EVENT_SOMETHING_APPEND = 'change_append';

const evtmsk = function(ns, cmd, space) {
  return `_${ns}:${cmd}:${space || ''}`;
};

const log = {
  error : debug('ubk:client'),
  info  : debug('ubk:client'),
  ping  : debug('ubk:client:ping'),
};

const EVENT_START_LOOP = guid(); //private

class Client extends Events {

  constructor(options) {
    super();

    this.options     = Object.assign({
      reconnect_delay : 2 * 1000,
    }, options || {});

    this._call_stack = {},
    this._rpcs       = {},
    this.register_rpc('base', 'ping', () => 'pong');
    this.shouldStop = true;
    this.once(EVENT_START_LOOP, this._run, this);
  }

  respond(query, response, error) {
    query.response = response;
    query.error    = error;
    delete query.args;
    try {
      this._transport.write(query);
    } catch(err) {
      log.error("can't write in the socket", err);
    }
  }

  send(ns, cmd /*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2);
    var args  = xargs.shift();

    var promise = defer();
    var quid    = guid();
    var query   = { ns, cmd, quid, args, xargs};

    this._call_stack[quid] = { ns, cmd, promise };

    log.info('Write', query);

    try {
      this._transport.write(query);
    } catch(err) {
      log.error("can't write in the socket", err);
      promise.reject(err);
    }
    return promise;
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

  async _run() {

    if(this._looping)
      throw "Already connected";

    this._looping = true;
    log.info("Connecting as %s", this.client_key);

    // Directly send register
    var wait = defer();

    do {
      if(this.shouldStop) {
        await sleep(200);
        continue;
      }

      try {

        this._transport = await this.transport();
        this._transport.on('message', this._onMessage.bind(this));
        this._transport.once('error', function() {
          wait.reject();
        });

        this.connected = true;

        this.emit('before_registration').catch(log.error);
        var opts = Object.assign({client_key : this.client_key}, this.options.registration_parameters);
        var registerTimeout =  defer();
        setTimeout(registerTimeout.reject, 2000);
        await Promise.race([this.send('base', 'register', opts), registerTimeout]);
        this.emit('registered').catch(log.error);
        this.emit('connected').catch(log.error);
        log.info('Client has been registered');

        do {
          wait = defer();
          setTimeout(wait.reject, 10000);
          var response =  await Promise.race([this.send('base', 'ping'), wait]);
          if(response != 'pong')
            throw "Invalid ping challenge reponse";

          if(this.shouldStop)
            throw "Should stop everything";

          wait = defer();
          setTimeout(wait.resolve, 10000);
          await wait;
        } while(true);

      } catch(err) {
        wait.resolve(); //make sure not unHandler promise can trigger
        log.error('' + err);
        if(this._transport)
          this._transport.destroy();

        this._transport = null;

        if(this.connected) {
          this.connected = false;
          this.emit('disconnected', err).catch(log.error);
        }

        this.connected = false;
        if(this.shouldStop)
          continue; //no need to wait
        await sleep(this.options.reconnect_delay);
      }

    } while(true);
  }

  export_json() {
    if(this._transport)
      return this._transport.export_json();
    return {};
  }


  connect(host, port) {
    this.emit(EVENT_START_LOOP).catch(log.error);
    this.options.server_hostaddr = host || this.options.server_hostaddr ;
    this.options.server_port     = port || this.options.server_port;
    this.shouldStop = false;
  }

  disconnect() {
    if(this._transport)
      this._transport.destroy();

    this.shouldStop = true;
  }

  _onMessage(data) {

    if(((data.ns == 'base') && (data.cmd == 'ping')) || (data.response == 'pong'))
      log.ping("Received", data);
    else
      log.info("Received", data);

    // Local call stack
    var callback = this._call_stack[data.quid];

    if(callback) {
      callback.promise.chain(data.error, data.response);
      this.emit(EVENT_SOMETHING_APPEND, callback.ns, callback.cmd).catch(log.error);
      delete this._call_stack[data.quid];
      return;
    }

    this.emit('message', data).catch(log.error);
    this.emit(evtmsk(data.ns, data.cmd), this, data)
      .then(() => {
        this.emit(EVENT_SOMETHING_APPEND, data.ns, data.cmd).catch(log.error);
      })
      .catch(log.error);
  }

}

module.exports = Client;
