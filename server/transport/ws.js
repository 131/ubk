"use strict";


const guid    = require('mout/random/guid');
const once    = require('nyks/function/once');
const Class   = require('uclass');

const WSTransport = new Class({

  Binds : [
    'receive',
    'disconnect',
    'send',
    'export_json',
  ],

  _stream : null,
  id : '',

  initialize : function(stream, message, disconnected) {

    //this.id = stream.id;
    this._stream = stream
    this.id = guid() ;

    this.onMessage =  message ;
    this.onDisconnect = once(disconnected);

    this._stream.on('message', this.receive);

    this._stream.once('error',  this.disconnect);
    this._stream.once('close',  this.disconnect);
    this._stream.once('disconnect', this.disconnect);

  },

  // Export device configuration
  export_json : function(){
    return {
      type    : 'websocket',
      secured : false,
      address : this._stream.upgradeReq.connection.remoteAddress,
      port :  this._stream.upgradeReq.connection.remotePort,
      network:  this.localAddress,
    }
  },

  // Received some data from web socket
  // Propagate them
  receive : function(data){
      this.onMessage(JSON.parse(data));
  },

  // Send some data over the web socket
  send : function(data){
    try {
      this._stream.send(JSON.stringify(data));
    } catch(e){
      this.log.info("Failed to write in ws client. ", e);
    }
  },

  disconnect : function(){

    if(this._stream != null)
      this._stream.close();
    this._stream = null;

    this.onDisconnect();
  }

});


module.exports = WSTransport;