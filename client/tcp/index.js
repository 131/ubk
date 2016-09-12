"use strict";

const net     = require('net');
const tls     = require('tls');

const Class   = require('uclass');
const Options = require('uclass/options');
const guid    = require('mout/random/guid');
const merge   = require('mout/object/merge');
const indexOf = require('mout/array/indexOf');
const once    = require('nyks/function/once');


const Client  = require('../')


var TCPClient = new Class({
  Implements : [Options, Client],
  Binds : ['receive', 'disconnect'],


  // Server configuration
  options : {
    server_hostaddr : '127.0.0.1',
    server_port     : 8000,
    registration_parameters : {},
  },

  // Network protocol
  Delimiter : 27,

  _socket : null,
  _buffer : null,
  _tls    : {},


  initialize:function(options, server_hostaddr) {
    this.setOptions(options);
    var license     = options.license;
    this.client_key  = options.client_key || guid();

    if(license) {
      this._tls = {
          key   : license.private_key,
          cert  : license.client_certificate,
          ca    : license.ca
      };
    }

    options.server_hostaddr  = server_hostaddr || options.server_hostaddr;
    options.server_hostname  = options.server_hostname || options.server_hostaddr;
  },


  // Initialier a crypted TLS socket
  build_tls_socket : function(callback) {
    if(!this._tls.key)
      throw new Error("Missing private key");
    if(!this._tls.cert)
      throw new Error("Missing certificate");

    // Setup TLS connection
    var lnk = merge({
      host               : this.options.server_hostaddr,
      port               : this.options.server_port,
      rejectUnauthorized : false,
      servername         : this.options.server_hostname.toLowerCase(),
    }, this._tls);


    this.log.info("Connecting with TLS to %s:%s", lnk.host, lnk.port);

    // TLS socket with options & callback
    return tls.connect(lnk, callback);
  },


  // Initialize a cleartext tcp socket
  build_net_socket : function(callback) {

    var lnk = {
      host : this.options.server_hostaddr,
      port : this.options.server_port,
    };
    this.log.info("Connecting with cleartext to %s:%s", lnk.host, lnk.port);
    return net.connect(lnk, callback);
  },

  // Connect to the server
  connect : function(chainConnect, chainDisconnect, server_addr) {
    var self = this;

    this.options.server_hostaddr = server_addr || this.options.server_hostaddr ;
    this._buffer = new Buffer(0);

    // Secured or clear method ?
    var is_secured    = !!(this._tls.key && this._tls.cert);
    var socket_method = is_secured ? this.build_tls_socket : this.build_net_socket;

    this._onDisconnect = once(chainDisconnect || Function.prototype);
    chainConnect       = once(chainConnect || Function.prototype);

    this._socket = socket_method.call(this, function() {
      self._doConnect(chainConnect);
    });

    this._socket.on('data', this.receive);
    this._socket.once('end', this.disconnect);
    this._socket.once('error' , this.disconnect);
  },


  // Low level method to send JSON data
  write : function(json) {
    try {
      this._socket.write(JSON.stringify(json));
      this._socket.write(String.fromCharCode(this.Delimiter));
    } catch (e) {
      this.log.info("can't write in the socket" , e) ;
    } 
  },

  // Received some data
  receive : function(chars) {
    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = indexOf(this._buffer, this.Delimiter)) != -1) {
      var buff = this._buffer.slice(0, delimiter_pos), data;
      this._buffer = this._buffer.slice(delimiter_pos + 1);
      try {
         data = JSON.parse(buff.toString());
      } catch(e) {
        this.log.error("Parsing response failed: "+e);
      }
      this._onMessage(data);
    }
  },
  
  export_json : function() {
    if(!this._socket)
      return {};

    return {
      type    : 'tcp',
      address : this._socket.remoteAddress,
      port    : this._socket.remotePort,
      network : this._socket.address()
    };
  },

  
  disconnect : function(error) {
    Client.prototype.disconnect.call(this);

    if(this._socket) {
      this._socket.destroy();
      this._socket = null;
    }

    this._onDisconnect(error);
  },


});

module.exports = TCPClient;