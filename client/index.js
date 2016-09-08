"use strict";

const Class   = require('uclass');
const guid    = require('mout/random/guid');
const Events  = require('eventemitter-co');
const defer   = require('nyks/promise/defer');
const merge   = require('mout/object/merge');
const detach  = require('nyks/function/detach');

const debug = require('debug');

const EVENT_SOMETHING_APPEND = "change_append";

const evtmsk = function(ns, cmd) {
  return `_${ns}:${cmd}`;
}

const Client =  new Class({
  Implements : [Events],

  _call_stack : {},
  log : {
    info : debug("client")
  },

  initialize : function() {

    this.register_rpc('base', 'ping', function *(){
      return Promise.resolve("pong");
    });

  },


  respond : function(query, response, error){
    query.response = response;
    query.error    = error;
    delete query.args;
    this.write(query);
  },

  send : function(ns, cmd /*, payload[, xargs..] */){
    var xargs = [].slice.call(arguments, 2),
      args  = xargs.shift();


    var promise = defer();
    var quid = guid();
    var query = { ns, cmd, quid, args, xargs};

    this._call_stack[quid] = { ns, cmd, promise };

    this.log.info("Write", query);
    this.write(query);

    return promise;
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


  _doConnect : function(chain) {
    var self = this;

    this.log.info("Connecting as %s", this.client_key);

    // Directly send register

    var opts = merge({client_key : self.client_key}, self.options.registration_parameters);

    self.send('base', 'register', opts).then(function(){
      chain();

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

      self.emit("registered");
    }).catch(detach(function(err){ throw err }));
  },


  _onMessage : function(data) {
    this.log.info("Received", data);
    // Local call stack
    var callback = this._call_stack[data.quid];

    if(callback) {
       callback.promise.chain(data.error, data.response);

      this.emit(EVENT_SOMETHING_APPEND, callback.ns, callback.cmd)
      delete this._call_stack[data.quid];
      return;
    }

    this.emit("message", data);
    this.emit(evtmsk(data.ns, data.cmd), this , data);
    this.emit(EVENT_SOMETHING_APPEND, data.ns, data.cmd)
  },

  disconnect : function(){
    clearInterval(this._heartbeat);
  },

});


module.exports = Client;