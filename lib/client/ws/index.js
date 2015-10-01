var Class = require('uclass');

var client  = require('../client')
var cmdsDispatcher  = require('../../cmdsDispatcher')


module.exports = new Class({
  Binds : [
    'receive',
    'connect',
    'ondeconnection',

  ],
  url : '',
  socket : null,


  initialize : function(url) {
    Implements : [Options, require("uclass/events"), client, cmdsDispatcher],

    this.url = url.replace('http','ws') ;
    this.socket = new WebSocket(this.url) ;
    this.socket.onmessage = this.receive ;
    this.register_namespace('base', this.base_command);

  },

  ondeconnection : function(chain){
    this.socket.onclose = chain ;
  },

  connect : function(chain){
    this.socket.onopen = chain;
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

    base_command : function(query){
    // Just response to ping.
    if(query.cmd == "ping")
      return this.respond(query, "pong");
  },

});