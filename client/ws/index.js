"use strict";


const Class   = require('uclass');
const Options = require('uclass/options');
const guid    = require('mout/random/guid');
const once    = require('nyks/function/once');
const merge   = require('mout/object/merge');
const Client  = require('../');



const WSClient = new Class({
  Implements : [Options, Client],
  Binds : ['receive', 'disconnect'],


  url : '',
  _socket : null,
  client_key : null,
  options : {
    registration_parameters : {},
  },

  initialize : function(url , options) {
    this.setOptions(options || {});
    this.url = url.replace('http','ws') ;
    this.client_key  = guid();
  },

  connect : function(chainConnect, chainDisconnect) {
    var self = this ;

    this._onDisconnect = once(chainDisconnect || Function.prototype);
    chainConnect       = once(chainConnect || Function.prototype);

    this._socket = new WebSocket(this.url) ;
 

    this._socket.onopen = function() {
      self._doConnect(chainConnect);
    };

    this._socket.onmessage = this.receive;
    this._socket.onclose   = this.disconnect;
  },

  write : function(data) {
    this._socket.send(JSON.stringify(data));
  },

  // Received a message
  receive : function(message) {
    var data = JSON.parse(message.data) ;
    this._onMessage(data);
  },


  disconnect : function(error){
    Client.prototype.disconnect.call(this);

    if(this._socket) {
      this._socket.close();
      this._socket = null;
    }

    this._onDisconnect(error);
  }

});


module.exports = WSClient;