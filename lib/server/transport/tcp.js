var Class   = require('uclass');

var guid    = require('mout/random/guid');
var indexOf = require('mout/array/indexOf');

module.exports = new Class({
  Binds : [
    'receive',
    'disconnect',
    'send',
  ],

  // Network stuff
  Delimiter : 27,

  _buffer    : null,
  _connected : false,
  _stream    : null,

  // TLS
  secured   : false,
  client_key   : null,

  initialize : function(stream, message, disconnect){
    this._buffer = new Buffer(0);

    // Listen TCP Stream events
    this._stream      = stream;
    this.onMessage    = message;
    this.onDisconnect = disconnect;

    this._stream.on('data', this.receive);
    this._stream.on('error', this.disconnect);

    // Load client cert when secured
    if(this._stream.encrypted != null){
      var cert       = this._stream.getPeerCertificate();
      this.client_key  = cert.subject.CN;
      this.secured   = true;
      console.log("Connected using SSL cert " + this.client_key);
    } else {
      this.client_key  = guid();
    }
  },

  // Export client configuration
  export_json : function(){
    return {
      type    : 'tcp',
      address : this._stream.remoteAddress,
      port    : this._stream.remotePort,
      secured : this.secured,
      name    : this.client_key,
    }
  },

  // Received some data
  // * add to buffer
  // * read until delimiter
  // * send back to client via event
  receive : function(chars){

    this._connected = true;
    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = indexOf(this._buffer, this.Delimiter)) != -1) {
      // Read until delimiter
      var buff = this._buffer.slice(0, delimiter_pos);
      this._buffer = this._buffer.slice(delimiter_pos + 1);

      // Check data are json
      var data = null;
      try {
        data = JSON.parse(buff.toString());
      } catch(e) {
        console.log("Bad data, not json", buff, "<raw>", buff.toString(), "</raw>");
        continue;
      }

      // Send to client
      if(data)
        this.onMessage(data);
    }
  },

  // Send some data over the tcp stream
  send : function(data){
    try{
      this._stream.write(JSON.stringify(data));
      this._stream.write(String.fromCharCode(this.Delimiter));
    } catch(e) {
      console.log("Failed to write in tcp client. "+e);
    }
  },

  // On error : Kill stream
  disconnect:function(){
    if(!this._connected)
      return; // avoid infinite loops
    this._connected = false;

    if(this._stream != null)
      this._stream.end();
    this._stream = null;

    this.onDisconnect();
  },

});
