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

  respond : function(query, response){
    query.response = response;
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
    this.send(ns, cmd, args, function(response){
      callback.apply(null, response);
    });
  },

  onMessage : function(data){
    console.log("client receve" , data)
    // Local call stack
    if(data.quid in this._call_stack) {
      this._call_stack[data.quid](data.response);
      delete this._call_stack[data.quid];
      return;
    }

    this._dispatch(this, data);
  },

});
