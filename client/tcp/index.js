"use strict";

const net     = require('net');
const tls     = require('tls');
const guid    = require('mout/random/guid');
const once    = require('nyks/function/once');

const Client  = require('../')

class TCPClient extends Client {

  constructor(options, server_hostaddr){
    options = Object.assign({
      server_hostaddr : '127.0.0.1',
      server_port     : 8000,
      registration_parameters : {},
    }, options);

    options.server_hostaddr  = server_hostaddr || options.server_hostaddr;
    options.server_hostname  = options.server_hostname || options.server_hostaddr;
    super(options);
      // Network protocol
    this.Delimiter = 27;

    this._socket = null;
    this._buffer = null;
    this._tls    = {};

    var license     = options.license;
    this.client_key  = options.client_key || guid();

    if(license) {
      this._tls = {
          key   : license.private_key,
          cert  : license.client_certificate,
          ca    : license.ca
      };
    }
  }

  // Initialier a crypted TLS socket
  build_tls_socket(callback) {
    if(!this._tls.key)
      throw new Error("Missing private key");
    if(!this._tls.cert)
      throw new Error("Missing certificate");

    // Setup TLS connection
    var lnk = Object.assign({
      host               : this.options.server_hostaddr,
      port               : this.options.server_port,
      rejectUnauthorized : false,
      servername         : this.options.server_hostname.toLowerCase(),
    }, this._tls);


    this.log.info("Connecting with TLS to %s:%s", lnk.host, lnk.port);

    // TLS socket with options & callback
    return tls.connect(lnk, callback);
  }

  // Initialize a cleartext tcp socket
  build_net_socket(callback) {
    var lnk = {
      host : this.options.server_hostaddr,
      port : this.options.server_port,
    };
    this.log.info("Connecting with cleartext to %s:%s", lnk.host, lnk.port);
    return net.connect(lnk, callback);
  }
  
  // Connect to the server
  connect(chainConnect, chainDisconnect, server_addr) {
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

    this._socket.on('data', this.receive.bind(this));
    this._socket.once('end', this.disconnect.bind(this));
    this._socket.once('error' , this.disconnect.bind(this));
  }

  // Low level method to send JSON data
  write(json) {
    this._socket.write(JSON.stringify(json));
    this._socket.write(String.fromCharCode(this.Delimiter));
  }

  // Received some data
  receive(chars) {
    var delimiter_pos;
    this._buffer = Buffer.concat([this._buffer, chars]);

    while((delimiter_pos = this._buffer.indexOf(this.Delimiter)) != -1) {
      var buff = this._buffer.slice(0, delimiter_pos), data;
      this._buffer = this._buffer.slice(delimiter_pos + 1);
      try {
         data = JSON.parse(buff.toString());
      } catch(e) {
        this.log.error("Parsing response failed: "+e);
      }
      this._onMessage(data);
    }
  }
  
  export_json() {
    if(!this._socket)
      return {};
    return {
      type    : 'tcp',
      address : this._socket.remoteAddress,
      port    : this._socket.remotePort,
      network : this._socket.address()
    };
  }

  disconnect(error) {
    super.disconnect();

    if(this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    this._onDisconnect(error);
  }

}

module.exports = TCPClient;