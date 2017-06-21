"use strict";

const net     = require('net');
const tls     = require('tls');

const TCPTransport = require('./transport');

class TCPClient extends Client {
  constructor(options, server_hostaddr) {

    options = Object.assign({
      server_hostaddr : '127.0.0.1',
      server_port     : 8000,
      registration_parameters : {},
    }, options);

    options.server_hostaddr  = server_hostaddr || options.server_hostaddr;
    options.server_hostname  = options.server_hostname || options.server_hostaddr;
    super(options);
      // Network protocol

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


  // Initialize a cleartext tcp socket
  build_net_socket(callback) {
    var lnk = {
      host : this.options.server_hostaddr,
      port : this.options.server_port,
    };
    this.log.info("Connecting with cleartext to %s:%s", lnk.host, lnk.port);
    return net.connect(lnk, callback);
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

  // Connect to the server
  * transport () {
    var self = this;

    this._buffer = new Buffer(0);

    // Secured or clear method ?
    var is_secured    = !!(this._tls.key && this._tls.cert);
    var socket_method = is_secured ? this.build_tls_socket : this.build_net_socket;

    var connect = defer();
    var socket = socket_method.call(this, connect.chain);
    yield connect();


    return new TCPTransport(socket);
  }

}