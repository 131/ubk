"use strict";

const guid    = require('mout/random/guid');
const Events  = require('eventemitter-co');
const defer   = require('nyks/promise/defer');
const sleep   = require('nyks/function/sleep');

const debug = require('debug');
const logPing = debug("ubk:client:ping")

const EVENT_SOMETHING_APPEND = "change_append";

const evtmsk = function(ns, cmd, space) {
  return `_${ns}:${cmd}:${space||''}`;
}

class Client extends Events {
  constructor(options) {
    super();
    this.options     = Object.assign({
      reconnect_delay : 2 * 1000,
    }, options || {});
    this._call_stack = {},
    this._rpcs       = {},
    this.log = {
      error : debug("ubk:client"),
      info  : debug("ubk:client")
    };
    this.register_rpc('base', 'ping', function *(){
      return Promise.resolve("pong");
    });
    this.shouldStop = true;
    this.start = this.start.bind(this);
  }

  respond(query, response, error){
    query.response = response;
    query.error    = error;
    delete query.args;
    try {
      this._transport.write(query);
    } catch(err) {
      this.log.error("can't write in the socket" , err);
    }
  }

  send(ns, cmd /*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2),
      args  = xargs.shift();

    var promise = defer();
    var quid = guid();
    var query = { ns, cmd, quid, args, xargs};

    this._call_stack[quid] = { ns, cmd, promise };

    this.log.info("Write", query);

    try {
      this._transport.write(query);
    } catch(err) {
      this.log.error("can't write in the socket" , err);
      promise.reject(err);
    }
    return promise;
  }


  register_cmd(ns, cmd, callback, ctx) {
    this.off( evtmsk(ns, cmd) );
    this.on( evtmsk(ns, cmd) , callback, ctx);
  }


  * call(ns, cmd) {
    var args = [].slice.call(arguments, 2);
    var proc = this._rpcs[evtmsk(ns, cmd, 'rpc')];
    if(!proc)
      throw "Invalid rpc command";
    return yield proc.callback.apply(proc.ctx || this, args);
  }


  register_rpc(ns, cmd, callback, ctx) {
    var self = this;

    this._rpcs[evtmsk(ns, cmd, 'rpc')] = {callback, ctx};

    this.register_cmd(ns, cmd, function* (client, query) {
      var response, err;
      try {
        var args = [query.args].concat(query.xargs || []);
        response = yield callback.apply(this, args);
      } catch(error) { err = ""+ error; }

      client.respond(query, response, err);
    }, ctx);
  }

  beforeRegistration(){
    //can be overwrite
  }

  * start () {

    var self = this;

    if(this._looping)
      throw "Already connected";

    this._looping = true;
    this.log.info("Connecting as %s", this.client_key);

    // Directly send register

    var wait = defer();

    do {

      if(this.shouldStop) {
        yield sleep(200);
        continue;
      }

      try {

        this._transport = yield this.transport();
        this._transport.on('message', this._onMessage.bind(this));
        this._transport.once('error' , function() {
           wait.reject();
        });

        this.connected = true;

        this.beforeRegistration();
        var opts = Object.assign({client_key : this.client_key}, this.options.registration_parameters);
        yield this.send('base', 'register', opts);
        this.emit('registered').catch(this.log.error);
        this.emit('connected').catch(this.log.error);
        this.log.info('Client has been registered');

        do {
          wait = defer();
          setTimeout(wait.reject, 10000);
          var response = yield [ function * () {
            var response = yield self.send("base" , "ping");
            if(response != "pong")
              throw "Invalid ping challenge reponse";
            wait.resolve()}
          , wait];

          if(this.shouldStop)
            throw "Should stop everything";

          wait = defer();
          setTimeout(wait.resolve, 10000);
          yield wait;
        } while(true);

      } catch(err) {
        this.log.error("" + err)
        if(this._transport)
          this._transport.destroy();

        this._transport = null;

        if(this.connected) {
          this.connected = false;
          this.emit('disconnected', err).catch(this.log.error);
        }

        this.connected = false;
        if(this.shouldStop)
          continue; //no need to wait
        yield sleep(this.options.reconnect_delay);
      }


    } while(true);
  }

  export_json() {
    if(this._transport)
      return this._transport.export_json();
    return {}
  }


  connect(host, port) {
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

    if(( (data.ns == 'base') && (data.cmd == 'ping') ) || (data.response == 'pong') ){
      logPing("Received", data)
    }else {
      this.log.info("Received", data);
    }

    // Local call stack
    var callback = this._call_stack[data.quid];

    if(callback) {
       callback.promise.chain(data.error, data.response);
      this.emit(EVENT_SOMETHING_APPEND, callback.ns, callback.cmd).catch(this.log.error);
      delete this._call_stack[data.quid];
      return;
    }

    this.emit("message", data).catch(this.log.error);
    this.emit(evtmsk(data.ns, data.cmd), this , data)
    .then(() => {
      this.emit(EVENT_SOMETHING_APPEND, data.ns, data.cmd).catch(this.log.error)
    })
    .catch(this.log.error);
  }

}



module.exports = Client;