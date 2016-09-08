"use strict";


const guid    = require('mout/random/guid');
const Class   = require('uclass');

const WSTransport = new Class({

  Binds : [
    'receive',
    'disconnect',
    'send',
    'export_json',
  ],

  connected : false,
  stream : null,
  initial_lnk : null,
  stream      : null,
  id : '',

  initialize : function(stream, message, disconnected) {

    //this.id = stream.id;
    this.stream = stream
    this.id = guid() ;
    this.connected = true;


    this.initial_lnk = this.export_json();

    this.onMessage =  message ;

    this.stream.on('message', function(data){
       message(JSON.parse(data));
    });

    this.stream.on("error", function(){
      console.log("ON error");

    });
    this.stream.on("close", function(){
      console.log("ON close");

    });
    this.stream.on("disconnect", function(){
      console.log("ON disconnect");

    });
    this.stream.once('error',  disconnected);
    this.stream.once('close',  disconnected);
    this.stream.once('disconnect', disconnected);

  },

  // Export device configuration
  export_json : function(){
    return {
      type    : 'websocket',
      secured : false,
      address : this.stream.upgradeReq.connection.remoteAddress,
      port :  this.stream.upgradeReq.connection.remotePort,
      network:  this.stream.upgradeReq.headers.host.split(':')[0] // ip:port (sometimes)
    }
  },

  // Received some data from web socket
  // Propagate them
  receive : function(data){
      this.onMessage(JSON.parse(data));
  },

  // Send some data over the web socket
  send : function(data){
    if(this.connected)
      this.stream.send(JSON.stringify(data));
  },

  disconnect : function(){
    this.stream.close();
  }

})


module.exports = WSTransport;