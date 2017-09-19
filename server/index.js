"use strict";

const tls   = require('tls');
const net   = require('net');
const debug = require('debug');


const Class   = require('uclass');
const Options = require('uclass/options');
const Client  = require('./client.js');
const merge   = require('mout/object/merge');
const forIn   = require('mout/object/forIn');
const Events  = require('eventemitter-co');
const eachSeries = require('async-co/eachOfSeries');
const defer      = require('nyks/promise/defer');

const EVENT_SOMETHING_APPEND = "change_append";


const evtmsk = function(ns, cmd) {
  return `_${ns}:${cmd}`;
}

const Server = new Class({
  Implements : [ Events, Options],

  Binds : [
    'start',
    '_onMessage',

    'heartbeat',
    'build_tls_server',
    'build_net_server',
    'new_tcp_client',
    'new_websocket_client',
    'get_client',

    'register_client',
    'lost_client',
    'call',
  ],

  _clientsList : {},
  _rpcs       : {},

  _clientHeartBeat : null,

  options : {
    'secured'       : false,
    'server_port'   : 8000,
    'socket_port'   : 8001,
    'heartbeat_interval' : 1000 * 20,
    'broadcasting_registration'  : true,
    'tls_options' : {
      'requestCert': true,
      'rejectUnauthorized' : true,
      'key' :  null,
      'cert' : null,
      'ca' : [ null ]
    }
  },

  log : {
    info  : debug("ubk:server"),
    error : debug("ubk:server"),
  },

  initialize:function(options) {

    this.setOptions(options);
    
    if(this.options.secured) {
      this.tcp_server = tls.createServer(this.options.tls_options, this.new_tcp_client);
    } else {
      this.tcp_server = net.createServer(this.new_tcp_client);
    }

    this.register_rpc('base', 'ping', function *(){
      return Promise.resolve("pong");
    });

    this.register_cmd('base', 'register', this.register_client);

    var self = this;
    
    this.register_cmd('base', 'register_sub_client'  , function*(client, query){
      var sub_client_registrationargs = query.args;
      var error, response;
      try{
        yield self.register_sub_client(client, sub_client_registrationargs);
      }catch(err){
        self.log.error(err)
        error = err ;
      }
      client.respond(query, response, error);
    })

    this.register_cmd('base', 'unregister_sub_client',function*(client, query){
      var sub_client_key    = query.args.client_key;
      var error, response;
      try{
        self.unregister_sub_client(client, sub_client_key);
      }catch(err){
        self.log.error(err)
        error = err ;
      }
      client.respond(query, response, error);
    })
  },

  register_sub_client : function* (client, sub_client_registrationargs) {
    var sub_client_key    = sub_client_registrationargs.client_key;
    var client_capability = sub_client_registrationargs.client_capability;
    var all_sub_client = this.get_all_sub_client();
    if(all_sub_client[sub_client_key])
      throw `Client '${sub_client_key}' already exists, sorry`;
    var validated_data = yield this.validate_sub_client(sub_client_key, client_capability);
    var sub_client = client.add_sub_client(sub_client_key);
    this.emit('register_sub_client', sub_client, validated_data).catch(this.log.error);
  },

  unregister_sub_client : function(client, sub_client_key) {
    var sub_client        = client._sub_clients[sub_client_key];
    var error, response;
    if(!sub_client)
      throw `Client '${sub_client_key}' already unregistred`;
    client.remove_sub_client(sub_client.client_key);
    this.emit('unregister_sub_client', sub_client).catch(this.log.error);
  },

  validate_sub_client : function * (sub_client_key, client_capability){
    return true; // a redefinir
  },

  get_client : function(client_key){
    return this._clientsList[client_key];
  },

  get_all_sub_client : function(){
    var all_sub_client = {};
    forIn(this._clientsList , (client)=>{
      all_sub_client = merge(all_sub_client, client._sub_clients);
    })
    return all_sub_client;
  },

  start : function( ) { /*chain*/
    var args = [].slice.apply(arguments),
        chain = args.shift() || Function.prototype;

    var defered = defer();
    var self = this;
    var server_port = this.options.server_port;

    this._clientHeartBeat = setInterval(this.heartbeat,  this.options.heartbeat_interval);

    this.log.info("Server is in %s mode", this.options.secured ? "SECURED" : "NON SECURED");

    this.tcp_server.listen({port:server_port, host:'0.0.0.0'}, function(err) {
      self.options.server_port  =  self.tcp_server.address().port;
      self.log.info("Started TCP server for clients on port %d", self.options.server_port);
      defered.chain(err, self.options.server_port);
      chain();
    });
    return defered
  },

  heartbeat: function() {
    var self = this;

    forIn(this._clientsList, function(client) {
      // Check failures
      if(client.ping_failure) {
        self.log.info("client " + client.client_key + " failed ping challenge, assume disconnected");
        return client.disconnect();
      }

      // Send ping
      client.ping_failure = true;
      client.send('base', 'ping').then(function(response) {
        client.ping_failure = !(response == "pong");
      });
    });
  },


  // Build new client from tcp stream
  new_tcp_client : function(stream) {
    this.log.info("Incoming tcp stream");
    var client = new Client('tcp', stream);
    client.once('received_cmd', this.register_client);
  },

  // Build new client from web socket stream
  new_websocket_client : function(stream) {
    this.log.info("Incoming ws stream");
    var client = new Client('ws', stream);
    client.once('received_cmd', this.register_client);
  },


  register_client : function* (client, query) {
    var self = this;
    try {
      var args = query.args;
        //can only register once...
      if(query.ns != "base" || query.cmd != "register")
        throw `Un-expected registration query`;

      if(client.client_key)
        throw `Already registered client '${client.client_key}'`;

      client.client_key = args.client_key;
      // Check SSL client cert matches
      var exp = client.export_json();

      if(exp.secured && exp.name != client.client_key)
        throw `The cert '${exp.name}' does NOT match the given id '${client.client_key}'`;

      if(!client.client_key)
        throw `No id for client to register`;

      // Avoid conflicts
      if(this._clientsList[client.client_key])
        throw `Client '${client.client_key}' already exists, sorry`;

      try{
        yield eachSeries(args.sub_Clients_list || [] , this.register_sub_client.bind(this, client));
      }catch(error){
        console.log('cant register subClient ' , error);
      }

    }catch(err) {
      if(typeof query == "object")
        client.respond(query, null, err);
      return client.disconnect();
    }

    // Save client
    this._clientsList[client.client_key] = client;

    client.respond(query, "ok");
    client.once('disconnected', this.lost_client);
    client.on('received_cmd', this._onMessage);

      // THAT'S GREAT, LET'S NOTIFY EVERYBOOOOODYYYY
    client.emit("registered", args).catch(this.log.error);
    this.emit('registered_device', client, args).catch(this.log.error);
    if(this.options.broadcasting_registration)
      this.broadcast('base', 'registered_client', client.export_json());
 },


  lost_client : function(client){
    // Remove from list
    this.log.info("Lost client" , client.client_key);
    
    forIn(client._sub_clients, (sub_client) => {
      try{
        this.unregister_sub_client(client, sub_client.client_key);
      }catch(err){
        this.log.error(err);
      }
    })

    delete this._clientsList[client.client_key];

    this.emit('unregistered_device', client).catch(this.log.error);
    if(this.options.broadcasting_registration)
      this.broadcast('base', 'unregistered_client', {client_key : client.client_key });
  },

  unregister_cmd : function(ns, cmd) {
    this.off( evtmsk(ns, cmd) );
  },


  register_cmd : function(ns, cmd, callback, ctx) {
    this.off( evtmsk(ns, cmd) );
    this.on( evtmsk(ns, cmd) , callback, ctx);
  },


  call : function * (ns, cmd) {
    var args = [].slice.call(arguments, 2);
    var proc = this._rpcs[evtmsk(ns, cmd, 'rpc')];
    if(!proc)
      throw "Invalid rpc command";
    return yield proc.callback.apply(proc.ctx || this, args);
  },

  register_rpc : function(ns, cmd, callback, ctx) {
    var self = this;

    this._rpcs[evtmsk(ns, cmd, 'rpc')] = {callback, ctx};

    this.register_cmd(ns, cmd, function* (client, query) {
      var response, err;
      try {
        var args = [query.args].concat(query.xargs || []);
        response = yield callback.apply(this, args);
      } catch(error) { err = ""+ error; }

      client.respond(query, response, err);
    }, ctx);
  },

  _onMessage : function* (client, data) {
    var target = data.ns;
    if(typeof target == 'string') {
      let tmp = target.split(':'); //legacy ns:device_key syntax
      target = { ns : tmp[0], client_key : tmp[1] };
    }

    if(target.client_key) { //proxy
      this.log.info("proxy %s from %s to %s", data, client.client_key, target.client_key);
      var remote = this._clientsList[target.client_key], response, err;
      if(!remote)
        remote = this.get_all_sub_client()[target.client_key];
      try {
        if(!remote)
            throw `Bad client '${target.client_key}'`;
        response = yield remote.send.apply(remote, [target.ns, data.cmd, data.args].concat(data.xargs));
      } catch(error) {
        err = error;
      }
      return client.respond(data, response, err);
    }
    
    var ns  = target.ns;
    var cmd = data.cmd;
    this.emit(evtmsk(ns, cmd), client, data)
    .then(() => {
      this.emit(EVENT_SOMETHING_APPEND, ns, cmd).catch(this.log.error);
    })
    .catch(this.log.error);
  },


  broadcast : function (ns, cmd, payload) {
    var args = arguments;
    this.log.info("BROADCASTING ", ns, cmd);

    forIn(this._clientsList, function(client) {
      client.signal.apply(client, args);
    });

    this.emit(`${ns}:${cmd}`, payload).catch(this.log.error);
  },

});


module.exports = Server;
