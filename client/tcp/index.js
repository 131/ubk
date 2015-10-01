var Class = require('uclass');
var Options = require('uclass/options');
var guid    = require('mout/random/guid');
var indexOf = require('mout/array/indexOf');
var merge   = require('mout/object/merge');
var client  = require('../client')



var util = require('util'),
     net  = require('net'),
     http = require('http'),
     tls = require('tls');


module.exports = new Class({
  Implements : [Options, require("uclass/events"), client],
  Binds : [
    'connect',
    'build_tls_socket',
    'build_net_socket',
    'receive',
    'write',

    'call',

    '_dispatch',
    'base_command',
    '_dispatchNS',


    'register_namespace',
    'register_cmd',
    'unregister_namespace',
    'unregister_cmd',
  ],

  // Server configuration
  options : {
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

  // Logger
  log : console,

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
    this.register_namespace('base', this.base_command);
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

    // Secured or clear method ?
    var is_secured    = !!(this._tls.key && this._tls.cert);
    var socket_method = is_secured ? this.build_tls_socket : this.build_net_socket;

    // Connect using TLS
    this.log.info("Connecting as %s", this.client_key);

    this._buffer = new Buffer(0);
    this._socket = socket_method(function() {
      self.log.info('Client network connected');
      // Directly send register
      self.send('base', 'register', {client_key : self.client_key}, function(){
        chain();
        self.log.info('Client has been registered');

        self.emit("registered");
      });
    });

    this._socket.on('error' , function(err) {
      self.log.warn("cant connect to server" ,JSON.stringify(err)) ;
      ondisconnect();
    });

    // Bind datas
    this._socket.on('data', this.receive);
    this._socket.on('end', function() {
      self.log.info('Client disconnected');
      ondisconnect();
    });
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

  // Associate a callback to a namespace
  // Every message received with this namespace
  // will be sent to the associated callback
  register_namespace : function(namespace, callback){
    if(this.namespaces[namespace])
      throw new Error("Already registered namespace "+namespace);
    this.namespaces[namespace] = callback;
  },

  unregister_namespace : function(namespace){
    delete this.namespaces[namespace];
  },


  _cmds : {},

  unregister_cmd : function(ns, cmd){
    if(ns in this._cmds)
      delete this._cmds[ns][cmd];
  },



  call : function(ns, cmd, args, callback){
    args.push(callback);

    if(! (this._cmds[ns] && this._cmds[ns][cmd]))
      throw "Missing command";

    var task = this._cmds[ns][cmd];
    if(!task.task) //this is not a proper local callable !
      throw "Cannot use local call on non local tasks";

    task.task.apply(null, args);
  },


  register_rpc : function(ns, cmd, task){
    var self = this;
    var callback = function(query){
      var args = query.args;
      args.push(function(response){
        response = [].slice.apply(arguments);
        console.log("in client this is response", response);
        self.respond(query, response);
      });
      task.apply(null, args);
    };
    callback.task = task;

    this.register_cmd(ns, cmd, callback);
  },

  register_cmd : function(ns, cmd, callback){
    if(!this.namespaces[ns])
      this.register_namespace(ns, this._dispatchNS);
    
    if(this.namespaces[ns] != this._dispatchNS)
      return;

    if(!this._cmds[ns])
      this._cmds[ns] = {};
    this._cmds[ns][cmd] = callback;
  },

  _dispatchNS : function(query){
    this._cmds[query.ns][query.cmd](query);
  },

  _dispatch : function(data) {

    if(true || ! (data.cmd == "ping" && data.ns == "base") ) {
      this.log.info("[%s] received >>", this.client_key, data);
    }

    // Use valid namespaced callback
    var namespace = data.ns || 'base';
    if(namespace in this.namespaces)
      this.namespaces[namespace](data);
     else this.log.error("error", "Unknown namespace " + namespace );

  },

  // Base protocol handler
  base_command : function(query){

    // Just response to ping.
    if(query.cmd == "ping")
      return this.respond(query, "pong");
  },


});
