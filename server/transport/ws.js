"use strict";


const once    = require('nyks/function/once');
const Class   = require('uclass');
const Events  = require('eventemitter-co');
const debug   = require('debug');


const WSTransport = new Class({
  Implements : [Events],
  Binds : [ 'disconnect', ],

  _stream : null,

  log : {
    info : debug("server:client:ws")
  },

  initialize : function(stream) {

    this._stream = stream;

    this._stream.on('message',  (data) => {
      this.emit("transport_message", JSON.parse(data));
    });

    this._stream.once('error',  this.disconnect);
    this._stream.once('close',  this.disconnect);
    this._stream.once('disconnect', this.disconnect);

  },

  export_json : function() {
    if(!this._stream) //disconnected
      return {};

    return {
      type    : 'websocket',
      secured : false,
      address : this._stream.upgradeReq.connection.remoteAddress,
      port    : this._stream.upgradeReq.connection.remotePort,
    }
  },

  // Send some data over the web socket
  write : function(data) {
    try {
      this._stream.send(JSON.stringify(data));
    } catch(e){
      this.log.info("Failed to write in ws client. ", e);
    }
  },

  // On error : Kill stream
  disconnect:function(reason) {
    this.log.info("Disconnected client", reason);

    if(!this._stream)
      return;

    this._stream.close();
    this._stream = null;
    this.emit("transport_disconnect");
  },

});


module.exports = WSTransport;