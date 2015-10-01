var Class = require('uclass');
var guid    = require('mout/random/guid');


var util = require('util'),
     net  = require('net'),
     http = require('http'),
     tls = require('tls');


module.exports = new Class({
  Binds : [
    'receive',
    'send',
    'call_rpc',
    'respond',
    ],


  call_stack : {},


  respond : function(query, response){
    query.response = response;
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
      this.call_stack[quid] = callback;

    this.write(query);
  },


  call_rpc : function(ns, cmd, args, callback){
    this.send(ns, cmd, args, function(response){
      callback.apply(null, response);
    });
  },

  onMessage : function(data){

        // Local call stack
    if(data.quid in this.call_stack) {
      this.call_stack[data.quid](data.response);
      delete this.call_stack[data.quid];
      return;
    }


    this._dispatch(data);
  },

});
