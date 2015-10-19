var ws = require('ws') ;
var guid    = require('mout/random/guid');
var Class   = require('uclass');

module.exports = new Class({
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

          //https://github.com/Automattic/socket.io/issues/1737
        this.initial_lnk = this.export_json();

        this.onMessage =  message ;

        this.stream.on('message', function(data){
                                    message(JSON.parse(data));
                                });

        this.stream.on('error',  disconnected);
        this.stream.on('close',  disconnected);
        this.stream.on('disconnect', disconnected);

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
      this.stream.close(function(){});
    }

})
