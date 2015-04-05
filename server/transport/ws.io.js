exports.WebSocketIOClient = new Class({
  Binds : [
    'disconnect',
  ],

  _stream  : null,
  _connected : false,

  // Network stuff
  clientId   : null,


  initialize : function(stream, message, disconnect){
    this._stream = stream;
    this.clientId = this._stream.id;
    this._connected = true;

    this.onDisconnect = disconnect;

    console.log("Web socket Stream >> "+this.id);

    // Listen to data reception for specific commands
    this._stream.on('message', message);

    this._stream.on('error',      this.disconnect);
    this._stream.on('disconnect', this.disconnect);

  },

  // Export client configuration
  export_json : function(){
    try{
      var address = this._stream.handshake.address;
      return {
        type    : 'websocket',
        secured : false,
        address : address.address,
        port    : address.port,
      }
    } catch(e) {
      return {
        secured : false,
        type : 'websocket',
      }
    }
  },

  // Send some data over the web socket
  send : function(data){
    this._stream.send(data);
  },

  // On error : Kill stream
  disconnect:function(){
    if(!this._connected)
      return
    this._connected = false;
    console.log('Disconnect WEBSOCKET');
    this.onDisconnect(); // propagate
  },

});

