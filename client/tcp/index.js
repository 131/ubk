var Class   = require('uclass');
var Options = require('uclass/options');
var net     = require('net');
var tls     = require('tls');
var guid    = require('mout/random/guid');
var indexOf = require('mout/array/indexOf');
var merge   = require('mout/object/merge');
var once    = require('nyks/function/once');

var client  = require('../client')
var cmdsDispatcher  = require('../../lib/cmdsDispatcher')

module.exports = new Class({
  Implements : [Options, require("uclass/events"), client, cmdsDispatcher],

  Binds : [
    'connect',
    'build_tls_socket',
    'build_net_socket',
    'receive',
    'write',
    'base_command',
  ],

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

    // Always handle base
    this.register_cmd('base', 'ping', this.base_command);
  },


  // Initialier a crypted TLS socket
  build_tls_socket : function(callback){
    if(!this._tls.key)
      throw new Error("Missing private key");
    if(!this._tls.cert)
      throw new Error("Missing certificate");

    // Setup TLS connection
    var lnk = merge({
      host : this.options.server_hostaddr,
      port : this.options.server_port,
      servername : this.options.server_hostname.toLowerCase(),
    }, this._tls);


    this.log.info("Connecting with TLS to %s:%s", lnk.host, lnk.port);

    // TLS socket with options & callback
    return tls.connect(lnk, callback);
  },


  // Initialize a cleartext tcp socket
  build_net_socket : function(callback){

    var lnk = {
      host : this.options.server_hostaddr,
      port : this.options.server_port,
    };
    this.log.info("Connecting with cleartext to %s:%s", lnk.host, lnk.port);
    return net.connect(lnk, callback);
  },

  // Connect to the server
  connect : function(chain, ondisconnect, server_addr) {

    var self = this;

    this.options.server_hostaddr = server_addr || this.options.server_hostaddr ;
    if(!chain)
      chain = Function.prototype;
    if(!ondisconnect)
      ondisconnect = Function.prototype;

      ondisconnect = once(ondisconnect);
      chain        = once(chain);
    // Secured or clear method ?
    var is_secured    = !!(this._tls.key && this._tls.cert);
    var socket_method = is_secured ? this.build_tls_socket : this.build_net_socket;

    // Connect using TLS
    this.log.info("Connecting as %s", this.client_key);

    this._buffer = new Buffer(0);
    this._socket = socket_method(function() {
      self.log.info('Client network connected');
      // Directly send register
      self.send('base', 'register', merge({client_key : self.client_key}, self.options.registration_parameters), function(){

        chain();
        self.log.info('Client has been registered');

        self.emit("registered");
      });
    });

    this._socket.once('error' , function(err) {
      self.log.warn("cant connect to server" ,JSON.stringify(err)) ;
      ondisconnect();
    });

    // Bind datas
    this._socket.on('data', this.receive);
    this._socket.once('end', function() {
      self.log.info('Client disconnected');
      ondisconnect();
    });
  },


  // Low level method to send JSON data
  write : function(json){
    try {
      this._socket.write(JSON.stringify(json));
      this._socket.write(String.fromCharCode(this.Delimiter));
    } catch (e) {
      console.log("can't write in the socket" , e) ;
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
      this.onMessage(data);
    }
  },


  // Base protocol handler
  base_command : function(client, query){
    // Just response to ping.
      return client.respond(query, "pong");
  },


});
