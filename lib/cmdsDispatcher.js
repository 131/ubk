var Class = require('uclass');


var util = require('util'),
     net  = require('net'),
     http = require('http'),
     tls = require('tls');


module.exports = new Class({
   Binds : [
    'call',
    '_dispatch',
    '_dispatchNS',
    'register_namespace',
    'register_cmd',
    'unregister_namespace',
    'unregister_cmd',
  ],

  namespaces : {},
  _cmds : {},

  // Associate a callback to a namespace
  // Every message received with this namespace
  // will be sent to the associated callback
  register_namespace : function(namespace, callback){
    if(callback.length < 2)
      console.log('depreciated better use callback with 2 args (client and data)')
    if(this.namespaces[namespace])
      throw new Error("Already registered namespace "+namespace);
    this.namespaces[namespace] = callback;
  },

  unregister_namespace : function(namespace){
    delete this.namespaces[namespace];
  },

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
      args.push(function(response){
        response = [].slice.apply(arguments);
        client.respond(query, response);
      });
      task.apply(null, args);
    };
    callback.task = task;

    this.register_cmd(ns, cmd, callback);
  },

  register_cmd : function(ns, cmd, callback){

    if(callback.length < 2)
      console.log('depreciated better use callback with 2 args (client and data)')
    if(!this.namespaces[ns])
      this.register_namespace(ns, this._dispatchNS);

    if(this.namespaces[ns] != this._dispatchNS)
      return;

    if(!this._cmds[ns])
      this._cmds[ns] = {};
    if(this._cmds[ns][cmd])
      throw new Error("Already registered "+namespace+'.'+cmd);
    this._cmds[ns][cmd] = callback;
  },

  _dispatchNS : function(client , query){
    if ((this._cmds[query.ns][query.cmd]).length < 2){
      this._cmds[query.ns][query.cmd](query);
    }else{
      this._cmds[query.ns][query.cmd](client , query);
    }
  },

  _dispatch : function(client , data) {

    //if(true || ! (data.cmd == "ping" && data.ns == "base") ) {
    console.log("%s received >> %s", client.id ,data);
    //}

    // Use valid namespaced callback
    var namespace = data.ns || 'base';
    if(namespace in this.namespaces){
      if ((this.namespaces[data.ns]).length < 2){
        this.namespaces[namespace](data) ;
      }else{
        this.namespaces[namespace](client , data);
     }}else {
      console.log("error", "Unknown namespace " + namespace );
    }

  },


});
