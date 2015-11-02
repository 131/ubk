"use strict";

var Class = require('uclass');


module.exports = new Class({
   Binds : [
    'call',
    '_dispatch',
    'register_cmd',
    'unregister_cmd',
  ],

  _cmds : {},


  unregister_cmd : function(ns, cmd){
    if(ns in this._cmds)
      delete this._cmds[ns][cmd];
  },

  call : function(ns, cmd, args, callback){
    args.push(callback);

    if(! (this._cmds[ns] && this._cmds[ns][cmd]))
      throw "Missing command";

    var task = this._cmds[ns][cmd];
    if(!task.task) //this is not a proper local callable !
      throw "Cannot use local call on non local tasks";

    task.task.apply(null, args);
  },

  register_rpc : function(ns, cmd, task){
    var self = this;

    var callback = function(client, query){

      var args = query.args;
      args.push(function(error, response){
        client.respond(query, response, error);
      });
      task.apply(null, args);
    };
    callback.task = task;

    this.register_cmd(ns, cmd, callback);
  },

  register_cmd : function(ns, cmd, callback){

    var action = callback;
    if(action.length < 2) {
      console.log('deprecated syntax %s:%s, use callback with 2 args (client and data)', ns, cmd)
      action = function(device, data) { callback(data) };
    }

    if(!this._cmds[ns])
      this._cmds[ns] = {};
    if(this._cmds[ns][cmd])
      throw new Error("Already registered "+namespace+'.'+cmd);
    this._cmds[ns][cmd] = action;
  },

  _dispatch : function(client , query){
     if(query.ns in this._cmds){
       if(query.cmd in this._cmds[query.ns])
        this._cmds[query.ns][query.cmd](client , query);
    } else{
      console.log("error", "Unknown namespace " + query.ns)
    }
  },


});
