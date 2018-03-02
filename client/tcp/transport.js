"use strict";

const Events = require('eventemitter-co');
const debug  = require('debug');

const Delimiter = 27;

const log = {
  error : debug("ubk:client:tcp"),
  info  : debug("ubk:client:tcp")
};

class TCPTransport extends Events {

  constructor(socket) {
    super();

    this._socket = socket;
    this._buffer = new Buffer(0);

    socket.on('data', this.receive.bind(this));

    var error = (err) =>  {
      this.emit('error', err).catch(log.error);
    };
    socket.once('error', error);
    socket.once('end', error);
    socket.once('close', error);
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
      var buff = this._buffer.slice(0, delimiter_pos);
      var data;
      this._buffer = this._buffer.slice(delimiter_pos + 1);
      try {
        data = JSON.parse(buff.toString());
      } catch(e) {
        log.error("Parsing response failed", e);
      }
      this.emit('message', data).catch(log.error);
    }
  }

  destroy() {
    this.off('message');

    if(this._socket)
      this._socket.destroy();

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
