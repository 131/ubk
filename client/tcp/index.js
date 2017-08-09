"use strict";
const net     = require('net');
const tls     = require('tls');
const guid    = require('mout/random/guid');
const defer   = require('nyks/promise/defer');
const url     = require('url');
const TCPTransport = require('./transport');
const Client = require('../');

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

  *build_proxy_socket(){
    if(!this.options.PROXY)
      return null;
    var defered = defer();
    var proxy_url = url.parse(this.options.PROXY);
    this.log.info(`using proxy ${proxy_url.host}`)
    if(!proxy_url.port || !proxy_url.hostname)
      defered.reject(`Invalid proxy url '${this.options.PROXY}'`);
    var socket = net.createConnection(proxy_url.port, proxy_url.hostname, defered.chain);
    var handshake = `CONNECT ${this.options.server_hostaddr}:${this.options.server_port} HTTP/1.0\r\n\r\n`;
    socket.write(handshake);
    const success = new RegExp("^HTTP/[0-9.]+\\s+200");
    defered = defer();
    socket.once("data", (data) => {
      var i = data.indexOf("\r\n\r\n");
      if(i == -1)
        return defered.reject("No remote connection");
      var header = "" + data.slice(0, i);
      if(!success.test(header))
        return defered.reject(`Invalid proxy response '${header}'`);
      this.log.info(`connection to proxy established ${header}`)
      defered.resolve(socket);
    });
    return defered;
  }


  // Connect to the server
  *transport () {
    var host = this.options.server_hostaddr;
    var port = this.options.server_port;
    this.log.info(`try to connect to ${host}:${port}`);

    // Secured or clear method ?
    var is_secured    = !!(this._tls.key && this._tls.cert);
    var socket = yield this.build_proxy_socket();
    var lnk = socket ? {socket} : {host, port};

    lnk = Object.assign(lnk, {
      rejectUnauthorized : false,
      servername         : this.options.server_hostname.toLowerCase(),
    }, this._tls);
      
    var connect_method = is_secured ? tls : net;
    var connect = defer();
    var socket = connect_method.connect(lnk , connect.chain);
    socket.once('error', connect.chain);
    yield connect;

    return new TCPTransport(socket);
  }
}

module.exports = TCPClient;