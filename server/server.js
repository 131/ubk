var tls = require('tls'),
    net = require('net');

var Client = require('./client.js').Client;

var Server = module.exports = new Class({
  Implements : Events,

  Binds : [
    'heartbeat',
    'build_tls_server',
    'build_net_server',
    'new_tcp_client',
    'new_websocket_client',
    'register_client',
    'register_cmd',
    'received_cmd',
    'lost_client',
  ],

  _clientsList : {},
  _clientHeartBeat : null,

  initialize:function() {

    if(false) {
      var tls_options = {
          requestCert: true,
          rejectUnauthorized : true,
          key :  null,
          cert : null,
          ca : [ null ]
      };
      this.tcp_server = tls.createServer(tls_options, this.new_tcp_client);
    } else {
      this.tcp_server = net.createServer(this.new_tcp_client);
    }

  },

  start : function(chain) {
    var self = this;

    this._clientHeartBeat = setInterval(this.heartbeat, 1000 * 2.5);

    var tcp_method = bool(this.config.HERMES_SERVICES_SECURED) ? this.build_tls_server : this.build_net_server;

    console.log("Server is in %s mode", bool(this.config.HERMES_SERVICES_SECURED) ? "SECURED" : "NON SECURED");
    tcp_method(port);
    this.tcp_server.listen(port, function(){
      console.log("Started encrypted TCP server for clients on port "+port);
    }
  },

  hearbeat:function(){

    Object.each(this._clientsList, function(client){
      // Check failures
      if(client.ping_failure) {
        console.log("client " + client.client_id + " failed ping challenge, assume disconnected");
        return client.disconnect();
      }

      // Send ping
      client.ping_failure = true;
      client.send('base', 'ping', {}, function(response){
        client.ping_failure = false;
      });
    });
  },



  // Build new client from tcp stream
  new_tcp_client : function(stream){
    var client = new client('tcp', stream);
    client.addEvent('registered', this.register_client);
    client.addEvent('disconnected', this.lost_client);
    client.addEvent('received_cmd', this.received_cmd);
  },

  // Build new client from web socket stream
  new_websocket_client : function(stream){
    var client = new client('websocket', stream);
    client.addEvent('disconnected', this.lost_client);
    client.addEvent('received_cmd', this.received_cmd);
    this.register_client(client); // direct register, we are connected !
  },

  // Register an active client, with id
  // Used by new_tcp_client
  register_client : function(client){
    // Check id
    if(!client.client_key){
      console.log("No id for client to register");
      client.disconnect();
      return;
    }

    // Avoid conflicts
    if(this.clients[client.client_key]){
      console.log("TCP client "+client.client_key +" already exists, sorry");
      client.disconnect();
      return;
    }

    // Save client
    this.clients[client.client_key] = client;

    // Propagate
    this.fireEvent('registered_client', client);
    this.broadcast('base', 'registered_client', client.export_json());
  },

  lost_client : function(client){
    // Remove from list
    delete this.clients[client.client_key];
    this.fireEvent('unregistered_client', client);
    this.broadcast('base', 'unregistered_client', {client_key : client.client_key });

    Object.each(this.clients, function(target){
      this.broadcast('base', 'update_client', target.export_json());
    }.bind(this));

  },

  // Register a cmd for a namespace
  register_cmd : function(namespace, cmd, callback){
    console.log('Register '+namespace+'.'+cmd);
    if(!this.namespaces[namespace])
      this.namespaces[namespace] = {};
    if(this.namespaces[namespace][cmd])
      throw new Error("Already registered "+namespace+'.'+cmd);
    this.namespaces[namespace][cmd] = callback;
  },

  // Apply a registered command
  received_cmd : function(client, data){
    try{
      if(!data)
        throw new Error("No data.");
      if(!this.namespaces[data.ns])
        throw new Error("No namespace "+data.ns);
      var callback = this.namespaces[data.ns][data.cmd];
      if(!callback)
        throw new Error("No cmd "+data.cmd+" in namespace "+data.ns);
      callback(client, data);
    }catch(e){
      console.log("Failed callback for cmd: "+e);
    }
  },

  broadcast:function(namespace, cmd, payload){
    Object.each(this.clients, function(client){
      client.send(namespace, cmd, payload);
    });
  },

});