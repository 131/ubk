require('nyks');

var util = require('util'),
     net  = require('net'),
     http = require('http'),
     tls = require('tls');


exports.Client = new Class({
  Binds : [
    'connect',
    'build_tls_socket',
    'build_net_socket',
    'receive',
    'parse',
    'base_command',
  ],

  // Server configuration
  server_hostaddr : '127.0.0.1',
  server_port     : 8000,

  // Network protocol
  Delimiter : 27,

  _socket : null,
  _buffer : null,

  // Namespaces callbacks
  namespaces : {},
  call_stack : {},

  // Logger
  log : null,

  initialize:function(license, server_hostaddr) {
    if(!license)
      throw new Exception("Invalid license file");

    this.client_id        = license.client_id;
    this.tls = {
        key   : license.private_key,
        cert  : license.client_certificate,
        ca    : license.ca
    };

    this.server_hostaddr  = server_hostaddr || license.server_hostaddr;
    this.server_hostname  = license.server_hostname || this.server_hostaddr;

    // Always handle base
    this.register_namespace('base', this.base_command);
  },


  // Initialier a crypted TLS socket
  build_tls_socket : function(callback){
    if(!this.tls.key)
      throw new Error("Missing private key");
    if(!this.tls.cert)
      throw new Error("Missing certificate");

    // Setup TLS connection
    var lnk = Object.merge({
      host : this.server_hostaddr,
      port : this.server_port,
      servername : this.server_hostaddr.toLowerCase(),
    }, this.tls);

    console.log("Connecting with TLS to %s:%s", lnk.host, lnk.port);

    // TLS socket with options & callback
    return tls.connect(lnk, callback);
  },


  // Initialize a cleartext tcp socket
  build_net_socket : function(callback){
    var lnk = {
      host : this.server_hostaddr,
      port : this.server_port,
    };
    console.log("Connecting with cleartext to %s:%s", lnk.host, lnk.port);
    return net.connect(lnk, callback);
  },

  // Connect to the server
  connect : function(){
    if(!this.client_id)
      throw new Error("Missing client key");

    // Secured or clear method ?
    var is_secured = !!(this.tls.key && this.tls.cert);
    var socket_method = is_secured ? this.build_tls_socket : this.build_net_socket;

    // Connect using TLS
    console.log("Connecting as %s", this.client_id);

    this._buffer = new Buffer(0);
    this._socket = socket_method(function() {
      console.log('Client connected');
      // Directly send register
      this.send('base', 'register', {client_id : this.client_id});
    }.bind(this));

    // Bind datas
    this._socket.on('data', this.receive);
    this._socket.on('end', function() {
      console.log('Client disconnected');
    });
  },

  // Send a command with some args to the server
  send : function(namespace, cmd, args, callback){
    var quid = String.uniqueID();

    var query = {
      ns : namespace,
      cmd : cmd,
      quid : quid,
      args : args
    };

    if(callback)
      this.call_stack[quid] = callback;

    this.write(query);
  },

  // Low level method to send JSON data
  write : function(json){
    this._socket.write(JSON.stringify(json));
    this._socket.write(String.fromCharCode(this.Delimiter));
  },

  // Received some data
  receive : function(chars) {
    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = this._buffer.indexOf(this.Delimiter)) != -1) {
      var buff = this._buffer.slice(0, delimiter_pos);
      this._buffer = this._buffer.slice(delimiter_pos + 1);
      try{
        this.parse(buff);
      }catch(e){
        console.log("Parsing response failed: "+e);
      }
    }
  },

  // Parse json data
  parse : function(data) {
    data = JSON.parse(data.toString());
    console.log("Received >>");
    console.log(data);

    // Local call stack
    if(data.quid in this.call_stack) {
      this.call_stack[data.quid](data.response);
      delete this.call_stack[data.quid];
      return;
    }

    // Use valid namespaced callback
    var namespace = data.ns || 'base';
    if(namespace in this.namespaces)
      this.namespaces[namespace](data);
     else console.log("error", "Unknown namespace " + namespace );

  },


  // Associate a callback to a namespace
  // Every message received with this namespace
  // will be sent to the associated callback
  register_namespace : function(namespace, callback){
    if(this.namespaces[namespace])
      throw new Error("Already registered namespace "+namespace);
    this.namespaces[namespace] = callback;
  },


  // Base protocol handler
  base_command : function(data){

    // Just response to ping.
    if(data.cmd == "ping"){
      data.response = "pong";
      return this.write(data);
    }

  },


});
