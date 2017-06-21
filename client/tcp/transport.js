"use strict";

const once    = require('nyks/function/once');
const Events  = require('eventemitter-co');

const Delimiter = 27;

class TCPTransport extends Events {

  constructor(socket){
    super();
    this._socket = socket;
    this._buffer = new Buffer(0);

    socket.on('data', this.receive.bind(this));
    socket.once('error', this.emit.bind(this, 'error'));
    socket.once('end',   this.emit.bind(this, 'error'));
  }

  // Low level method to send JSON data
  write(json) {
    this._socket.write(JSON.stringify(json));
    this._socket.write(String.fromCharCode(Delimiter));
  }

  // Received some data
  receive(chars) {
    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = this._buffer.indexOf(Delimiter)) != -1) {
      var buff = this._buffer.slice(0, delimiter_pos), data;
      this._buffer = this._buffer.slice(delimiter_pos + 1);
      try {
         data = JSON.parse(buff.toString());
      } catch(e) {
        this.log.error("Parsing response failed: "+e);
      }
      this.emit('message', data);
    }
  }

  destroy() {
    this.off('message');

    if(this._socket) {
      this._socket.destroy();
    }
    this._socket = null;
  }

  export_json() {

    if(!this._socket)
      return {};
    return {
      type    : 'tcp',
      address : this._socket.remoteAddress,
      port    : this._socket.remotePort,
      network : this._socket.address()
    };
  }

}

module.exports = TCPTransport;