"use strict";

var Class = require('uclass');
var guid    = require('mout/random/guid');



module.exports = new Class({
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

    var query = {
      ns   : ns,
      cmd  : cmd,
      quid : quid,
      args : args
    };

    if(callback)
      this._call_stack[quid] = callback;

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
    if(data.quid in this._call_stack) {
      this._call_stack[data.quid](data.response, data.error);
      delete this._call_stack[data.quid];
      return;
    }

    this.emit("message", data);

    this._dispatch(this, data);
  },

});
