"use strict";

const Class   = require('uclass');
const guid    = require('mout/random/guid');
const Events =  require('eventemitter-co');

const EVENT_SOMETHING_APPEND = "change_append";

module.exports = new Class({
  Implements : [Events],

  Binds : [
    'receive',
    'send',
    'call_rpc',
    'respond',
    ],

  _call_stack : {},
  log : console,

  respond : function(query, response, error){
    query.response = response;
    query.error    = error;
    delete query.args;
    this.write(query);
  },

  // Send a command with some args to the server
  send : function(ns, cmd, args, callback){
    var quid = guid();
    var query = { ns, cmd, quid, args};
    if(callback)
      this._call_stack[quid] = { callback, ns, cmd };
    this.write(query);
  },

  call_rpc : function(ns, cmd, args, callback){
    this.send(ns, cmd, args, function(response, error){
      callback.call(null, error, response);
    });
  },

  onMessage : function(data){
    this.log.info("Received >>");
    this.log.info(data);
    // Local call stack
    var callback = this._call_stack[data.quid];

    if(callback) {
      callback.callback(data.response, data.error);
      this.emit(EVENT_SOMETHING_APPEND, callback.ns, callback.cmd)
      delete this._call_stack[data.quid];
      return;
    }

    this.emit("message", data);

    this._dispatch(this, data);
  },

});
