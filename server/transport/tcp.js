"use strict";

const Class   = require('uclass');
const guid    = require('mout/random/guid');
const indexOf = require('mout/array/indexOf');
const once    = require('nyks/function/once');
const debug   = require('debug');
const Events  = require('eventemitter-co');


const TCPTransport = new Class({
  Implements : [Events],
  Binds : [ '_feed', 'disconnect', ],

  // Network stuff
  Delimiter : 27,

  _buffer    : null,
  _stream    : null,

  // TLS
  secured   : false,
  client_key   : null,

  log : {
    info : debug("server:client:tcp")
  },

  initialize : function(stream) {
    this._buffer = new Buffer(0);

    // Listen TCP Stream events
    this._stream      = stream;
    this._stream.setNoDelay(true);


    this._stream.on('data', this._feed);
    this._stream.once('error', this.disconnect);

    // Load client cert when secured
    if(this._stream.encrypted != null){
      var cert       = this._stream.getPeerCertificate();
      this.client_key  = cert.subject.CN;
      this.secured   = true;
      this.log.info("Connected using SSL cert " + this.client_key);
    } else {
      this.client_key  = guid();
    }
  },


  // Received some data
  // * add to buffer
  // * read until delimiter
  // * send back to client via event
  _feed : function(chars) {

    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = indexOf(this._buffer, this.Delimiter)) != -1) {
      // Read until delimiter
      var buff = this._buffer.slice(0, delimiter_pos);
      this._buffer = this._buffer.slice(delimiter_pos + 1);

      // Check data are json
      var data = null;
      try {
        data = JSON.parse(buff.toString());
      } catch(e) {
        this.log.info("Bad data, not json", buff, "<raw>", buff.toString(), "</raw>");
        continue;
      }


      // Send to client
      if(data)
        this.emit("transport_message", data);
    }
  },


  export_json : function() {
    if(!this._stream) //disconnected
      return {};

    return {
      type    : 'tcp',
      secured : this.secured,
      address : this._stream.remoteAddress,
      port    : this._stream.remotePort,
      name    : this.client_key,
    }
  },

  // Send some data over the tcp stream
  write : function(data) {
    try {
      this._stream.write(JSON.stringify(data));
      this._stream.write(String.fromCharCode(this.Delimiter));
    } catch(e) {
      this.log.info("Failed to write in tcp client. ", e);
    }
  },

  // On error : Kill stream
  disconnect:function(reason) {
    this.log.info("Disconnected client", reason);

    if(!this._stream)
      return;

    this._stream.end();
    this._stream = null;
    this.emit("transport_disconnect");
  },

});


module.exports = TCPTransport;