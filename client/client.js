"use strict";

const Class   = require('uclass');
const guid    = require('mout/random/guid');
const Events  = require('eventemitter-co');
const defer   = require('nyks/promise/defer');

const EVENT_SOMETHING_APPEND = "change_append";

module.exports = new Class({
  Implements : [Events],

  Binds : [
    'receive',
    'send',
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

    var promise = defer();
    var quid = guid();
    var query = { ns, cmd, quid, args};

    if(callback) {
      let resolve = promise.resolve, reject = promise.reject;

        //yes, it is flipped
      promise = promise.then(callback).catch(function(error){ callback(null, error) });

      promise.reject  = reject;
      promise.resolve = resolve;
    }

    this._call_stack[quid] = { ns, cmd, promise };
    this.write(query);

    return promise;
  },


  onMessage : function(data){
    this.log.info("Received >>");
    this.log.info(data);
    // Local call stack
    var callback = this._call_stack[data.quid];

    if(callback) {
       if(data.error)
        callback.promise.reject(data.error);
      else callback.promise.resolve(data.response);

      this.emit(EVENT_SOMETHING_APPEND, callback.ns, callback.cmd)
      delete this._call_stack[data.quid];
      return;
    }

    this.emit("message", data);

    this._dispatch(this, data);
  },

});
