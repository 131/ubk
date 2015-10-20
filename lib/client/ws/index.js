var Class = require('uclass');
var Options   = require('uclass/options');

var client  = require('../client');
var cmdsDispatcher  = require('../../cmdsDispatcher');
var WebSocket = require('ws');


module.exports = new Class({
  Implements : [Options, require("uclass/events"), client, cmdsDispatcher],

  Binds : [
    'receive',
    'connect',
    'write',
  ],

  url : '',
  socket : null,

  initialize : function(url) {
    this.url = url.replace('http','ws') ;
  },

  connect : function(chain, ondeconnection){
    this.socket = new WebSocket(this.url) ;
    this.socket.onclose = ondeconnection;
    this.socket.onmessage = this.receive ;
    if(this.socket.readyState)
      chain();
    this.socket.onopen = chain;
  },

  write : function(data){
    this.socket.send(JSON.stringify(data));
  },

  // Received a message
  receive : function(message) {
    var data = JSON.parse(message.data) ;
    this.onMessage(data);
  },

  // Helper to make a direct REST request to Hermes
  rest_request : function(path) {
    var url = this.url + path,
        out = null,
        request = new Request.JSON({
          async : false,
          url : url,
          onSuccess : function(value) { out = value;},
        });
    request.send();
    return out;
  },

});
