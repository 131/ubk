var ws = require('ws') ;
var guid    = require('mout/random/guid') ;


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
    stream      : nill,
    id : '',

    initialize : function(stream) {
        //this.id = stream.id;
        this.stream = stream
        this.id = guid() ;
        this.connected = true;

          //https://github.com/Automattic/socket.io/issues/1737
        this.initial_lnk = this.export_json();

        log.getInstance().getModule("Hermes").info("Web socket Stream >> " + this.id);

        this.stream.on('message', this.receive);
        this.stream.on('error',  this.disconnect);
        this.stream.on('close',  this.disconnect);
        this.stream.on('disconnect', this.disconnect);
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
        this.emit('received', JSON.parse(data));
    },

    // Send some data over the web socket
    send : function(data){
      if(this.connected)
        this.stream.send(JSON.stringify(data));
    },

    // On error : Kill stream
    disconnect: function(){
        if(!this.connected)
            return
        this.connected = false;
        log.getInstance().getModule("Hermes").warn('error on websocket-stream , disconnect stream ' )
        this.emit('disconnected');
    }

})
