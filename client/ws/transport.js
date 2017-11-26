"use strict";

const Events  = require('eventemitter-co');


class WSTransport extends Events {

  constructor(socket) {
    super();
    this._socket = socket;

    this._socket.onmessage = this.receive.bind(this);
    this._socket.onclose   = this.emit.bind(this, 'error');

  }

  write (data) {
    this._socket.send(JSON.stringify(data));
  }

  // Received a message
  receive (message) {
    var data = JSON.parse(message.data) ;
    this.emit('message', data);
  }

  destroy() {
    this.off('message');

    if(this._socket) {
      this._socket.destroy();
    }
    this._socket = null;
  }

}

module.exports = WSTransport;
