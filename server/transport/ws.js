"use strict";

const debug   = require('debug');
const Events  = require('eventemitter-co');

const log = {
  info  : debug('ubk:server:client:ws'),
  error : debug('ubk:server:client:ws'),
};

class WSTransport extends Events {

  constructor(stream) {
    super();

    this._stream = stream;

    this._stream.on('message',  (data) => {
      this.emit('transport_message', JSON.parse(data)).catch(log.error);
    });

    this.disconnect = this.disconnect.bind(this);
    this._stream.once('error',  this.disconnect);
    this._stream.once('close',  this.disconnect);
    this._stream.once('disconnect', this.disconnect);
  }

  export_json() {
    if (!this._stream) //disconnected
      return {};

    return {
      type    : 'websocket',
      secured : false,
      network : this._stream.upgradeReq.connection.localAddress,
      address : this._stream.upgradeReq.connection.remoteAddress,
      port    : this._stream.upgradeReq.connection.remotePort,
    };
  }

  // Send some data over the web socket
  write(data) {
    this._stream.send(JSON.stringify(data));
  }

  // On error : Kill stream
  disconnect(reason) {
    log.info("Disconnected client", reason);

    if (!this._stream)
      return;

    this._stream.removeAllListeners('message');
    this._stream.close();
    this._stream = null;
    this.emit('transport_disconnect').catch(log.error);
  }

}

module.exports = WSTransport;
