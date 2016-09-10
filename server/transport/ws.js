"use strict";


const guid    = require('mout/random/guid');
const once    = require('nyks/function/once');
const Class   = require('uclass');
const Events  = require('eventemitter-co');

const WSTransport = new Class({
  Implements : [Events],
  Binds : [ 'disconnect', ],

  _stream : null,
  id : '',

  initialize : function(stream) {

    //this.id = stream.id;
    this._stream = stream
    this.id = guid() ;


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

  disconnect : function() {
    if(this._stream)
      this._stream.close();
    this._stream = null;

    this.emit("transport_disconnect");
  }

});


module.exports = WSTransport;