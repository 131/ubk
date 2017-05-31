"use strict";

const guid    = require('mout/random/guid');
const Events  = require('eventemitter-co');
const defer   = require('nyks/promise/defer');
const detach  = require('nyks/function/detach');

const debug = require('debug');
const logPing = debug("ubk:client:ping")

const EVENT_SOMETHING_APPEND = "change_append";

const evtmsk = function(ns, cmd, space) {
  return `_${ns}:${cmd}:${space||''}`;
}

class Client extends Events{
  constructor(options){
    super();
    this.options     = options || {};
    this._call_stack = {},
    this._rpcs       = {},
    this.log = {
      error : debug("ubk:client"),
      info  : debug("ubk:client")
    };
    this.register_rpc('base', 'ping', function *(){
      return Promise.resolve("pong");
    });
  }

  respond(query, response, error){
    query.response = response;
    query.error    = error;
    delete query.args;
    try{
      this.write(query);
    }catch(err){
      this.log.error("can't write in the socket" , err);
    }
  }

  send(ns, cmd /*, payload[, xargs..] */){
    var xargs = [].slice.call(arguments, 2),
      args  = xargs.shift();

    var promise = defer();
    var quid = guid();
    var query = { ns, cmd, quid, args, xargs};

    this._call_stack[quid] = { ns, cmd, promise };

    this.log.info("Write", query);

    try{
      this.write(query);
    }catch(err){
      this.log.error("can't write in the socket" , err);
      promise.reject(err);
    }
    return promise;
  }


  register_cmd(ns, cmd, callback, ctx) {
    this.off( evtmsk(ns, cmd) );
    this.on( evtmsk(ns, cmd) , callback, ctx);
  }


  *call(ns, cmd) {
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


  _doConnect(chain) {
    var self = this;

    this.log.info("Connecting as %s", this.client_key);

    // Directly send register

    var opts = Object.assign({client_key : self.client_key}, self.options.registration_parameters);

    self.send('base', 'register', opts).then(function(){

      self.log.info('Client has been registered');

      var connected = true ;

      self._heartbeat =  setInterval(function() {
        if(!connected)
          return self.disconnect();

        connected = false;
        self.send("base" , "ping").then(function(response) {
          connected = (response == "pong");
        });
      }, 10000);

      chain();
      self.emit("registered").catch(self.log.error);
    }).catch(this.disconnect.bind(this));
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

  disconnect(){
    clearInterval(this._heartbeat);
  }
}



module.exports = Client;