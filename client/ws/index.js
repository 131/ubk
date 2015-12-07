var Class = require('uclass');
var Options   = require('uclass/options');
var guid    = require('mout/random/guid');
var once    = require('nyks/function/once');
var client  = require('../client');
var cmdsDispatcher  = require('../../lib/cmdsDispatcher');
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
  client_key : null,

  initialize : function(url) {
    this.url = url.replace('http','ws') ;
    this.client_key  = guid();
    // Always handle base
    this.register_cmd('base', 'ping', this.base_command);
  },

  connect : function(chain, ondeconnection){
    var self = this ;
    this.socket = new WebSocket(this.url) ;
    this.socket.onclose = once(ondeconnection);
    this.socket.onmessage = this.receive ;

    var onconnection = function(){
      self.send('base', 'register', {client_key : self.client_key}, function(){
        chain();
        console.log('Client has been registered');
      });
    }

    onconnection = once(onconnection);

    if(this.socket.readyState)
      onconnection();
    this.socket.onopen = onconnection;
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
