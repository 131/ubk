"use strict";

const debug   = require('debug');
const Events  = require('eventemitter-co');

const guid    = require('mout/random/guid');

const log = {
  info  : debug("ubk:server:client:tcp:info"),
  error : debug("ubk:server:client:tcp:error"),
};

const DELIMITER = 27;

class TCPTransport extends Events {

  constructor(stream) {
    super();

    // TLS
    this.secured = false;
    this.client_key = null;

    if(!stream.socket)
      stream.socket = stream;

    this._buffer = new Buffer(0);

    // Listen TCP Stream events
    this._stream      = stream;
    this._stream.setNoDelay(true);

    this._feed      = this._feed.bind(this);
    this.disconnect = this.disconnect.bind(this);

    this._stream.on('data', this._feed);
    this._stream.once('close', this.disconnect);
    this._stream.once('error', this.disconnect);

    // Load client cert when secured
    if(this._stream.encrypted != null) {
      var cert        = this._stream.getPeerCertificate();
      this.client_key = cert.subject.CN;
      this.secured    = true;
      log.info("Connected using SSL cert " + this.client_key);
    } else {
      this.client_key = guid();
    }
  }

  // Received some data
  // * add to buffer
  // * read until delimiter
  // * send back to client via event
  _feed(chars) {

    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = this._buffer.indexOf(DELIMITER)) != -1) {
      // Read until delimiter
      var buff = this._buffer.slice(0, delimiter_pos);
      this._buffer = this._buffer.slice(delimiter_pos + 1);

      // Check data are json
      var data = null;
      try {
        data = JSON.parse(buff.toString());
      } catch(e) {
        log.info("Bad data, not json", buff, "<raw>", buff.toString(), "</raw>");
        continue;
      }

      // Send to client
      if(data)
        this.emit("transport_message", data).catch(log.error);
    }
  }

  export_json() {
    if(!this._stream) //disconnected
      return {};

    return {
      type    : 'tcp',
      network : this._stream.socket.localAddress,
      secured : this.secured,
      address : this._stream.remoteAddress,
      port    : this._stream.remotePort,
      name    : this.client_key,
    };
  }

  // Send some data over the tcp stream
  write(data) {
    this._stream.write(JSON.stringify(data));
    this._stream.write(String.fromCharCode(DELIMITER));
  }

  // On error : Kill stream
  disconnect(reason) {
    log.info("Disconnected client", {reason});

    if(!this._stream)
      return;

    //closing tcp connection take time -> we stop listening data
    this._stream.removeAllListeners("data");
    this._stream.end();
    this._stream = null;
    this.emit("transport_disconnect", reason).catch(log.error);
  }

}


module.exports = TCPTransport;
