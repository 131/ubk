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
    'base_command'
  ],

  url : '',
  socket : null,

  initialize : function(url) {
    this.url = url.replace('http','ws') ;

    // Always handle base
    this.register_cmd('base', 'ping', this.base_command);
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

  base_command : function(query){
    // Just response to ping.
      return this.respond(query, "pong");
  }

});
