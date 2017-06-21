"use strict";


const guid    = require('mout/random/guid');
const once    = require('nyks/function/once');
const merge   = require('mout/object/merge');

const Client  = require('../');


class WSClient extends Client{
  constructor(url , options){
    options = Object.assign({
      registration_parameters : {},
    }, options);
    super(options)
    this.url = '';
    this._socket = null;
    this.client_key = null;
    this.url = url.replace('http','ws') ;
    this.client_key  = guid();
  }

  connect(chainConnect, chainDisconnect) {
    var self = this ;

    this._onDisconnect = once(chainDisconnect || Function.prototype);
    chainConnect       = once(chainConnect || Function.prototype);

    this._socket = new WebSocket(this.url) ;
 

    this._socket.onopen = function() {
      self._doConnect(chainConnect);
    };

    this._socket.onmessage = this.receive.bind(this);
    this._socket.onclose   = this.disconnect.bind(this);
  }

  write (data) {
    this._socket.send(JSON.stringify(data));
  }

  // Received a message
  receive (message) {
    var data = JSON.parse(message.data) ;
    this._onMessage(data);
  }

  disconnect(error){
    super.disconnect();

    if(this._socket) {
      this._socket.close();
      this._socket = null;
    }

    this._onDisconnect(error);
  }
}



module.exports = WSClient;