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
  socket : null,
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

    this.socket = new WebSocket(this.url) ;
 

    this.socket.onopen = function() {
      self._doConnect(chainConnect);
    };

    this.socket.onmessage = this.receive;
    this.socket.onclose   = this.disconnect;
  },

  write : function(data) {
    this.socket.send(JSON.stringify(data));
  },

  // Received a message
  receive : function(message) {
    var data = JSON.parse(message.data) ;
    this._onMessage(data);
  },


  disconnect : function(){
    Client.prototype.disconnect.call(this);

    try {
      this.socket.close();
    } catch(e) {
      this.log.info("cant't close socket : "+e);
    }

    this._onDisconnect();
  }

});


module.exports = WSClient;