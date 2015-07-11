var Class = require('uclass');
var Options = require('uclass/options');
var guid    = require('mout/random/guid');

var util = require('util'),
     net  = require('net'),
     http = require('http'),
     tls = require('tls');


module.exports = new Class({
  Implements : [Options],
  Binds : [
    'connect',
    'build_tls_socket',
    'build_net_socket',
    'receive',
    'parse',
    'base_command',
    'register_namespace',
  ],

  // Server configuration
  config : {
    server_hostaddr : '127.0.0.1',
    server_port     : 8000,
  },

  // Network protocol
  Delimiter : 27,

  _socket : null,
  _buffer : null,
  _tls    : {},

  // Namespaces callbacks
  namespaces : {},
  call_stack : {},

  // Logger
  log : null,

  initialize:function(config, server_hostaddr) {
    this.setOptions(config);

    var license     = config.license;
    this.client_key  = config.client_key || guid();

    if(license) {
      this._tls = {
          key   : license.private_key,
          cert  : license.client_certificate,
          ca    : license.ca
      };
    }

    config.server_hostaddr  = server_hostaddr || config.server_hostaddr;
    config.server_hostname  = config.server_hostname || config.server_hostaddr;

    // Always handle base
    this.register_namespace('base', this.base_command);
  },


  // Initialier a crypted TLS socket
  build_tls_socket : function(callback){
    if(!this._tls.key)
      throw new Error("Missing private key");
    if(!this._tls.cert)
      throw new Error("Missing certificate");

    // Setup TLS connection
    var lnk = Object.merge({
      host : this.config.server_hostaddr,
      port : this.config.server_port,
      servername : this.config.server_hostaddr.toLowerCase(),
    }, this._tls);

    console.log("Connecting with TLS to %s:%s", lnk.host, lnk.port);

    // TLS socket with options & callback
    return tls.connect(lnk, callback);
  },


  // Initialize a cleartext tcp socket
  build_net_socket : function(callback){
    var lnk = {
      host : this.config.server_hostaddr,
      port : this.config.server_port,
    };
    console.log("Connecting with cleartext to %s:%s", lnk.host, lnk.port);
    return net.connect(lnk, callback);
  },

  // Connect to the server
  connect : function(){
    if(!this.client_key)
      throw new Error("Missing client key");

    // Secured or clear method ?
    var is_secured = !!(this._tls.key && this._tls.cert);
    var socket_method = is_secured ? this.build_tls_socket : this.build_net_socket;

    // Connect using TLS
    console.log("Connecting as %s", this.client_key);

    this._buffer = new Buffer(0);
    this._socket = socket_method(function() {
      console.log('Client connected');
      // Directly send register
      this.send('base', 'register', {client_key : this.client_key});
    }.bind(this));

    // Bind datas
    this._socket.on('data', this.receive);
    this._socket.on('end', function() {
      console.log('Client disconnected');
    });
  },

  respond : function(query, response){
    query.response = response;
    this.write(query);
  },


  // Send a command with some args to the server
  send : function(ns, cmd, args, callback){
    var quid = String.uniqueID();

    var query = {
      ns   : ns,
      cmd  : cmd,
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
