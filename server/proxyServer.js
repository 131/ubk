'use strict';

const os     = require('os');

const Server = require('./index');
const Client = require('../client/tcp');

class ProxyServer extends Server {

  constructor(options){
    super(options.server);
    var self = this;

    this.on("registered_device", function*(client, args){
      try{
        args.client_key = args.client_key || client.client_key;
        yield self._client.send("base", "register_sub_client", args)      
      }catch(err){
        return client.disconnect('cant register client ' + client.client_key);
      }

      console.log("register sub_client " , client.client_key);

      client.on('received_cmd', function*(client, data){
        if(data.ns == 'base' &&  data.cmd == 'ping')
          return
        var ns = data.ns + "*" + client.client_key; 
        data.client_key = client.client_key;
        var response, error;
        try{
          var response = yield self._client.send.apply(self._client, [ns, data.cmd, data.args].concat(data.xargs || []));
        }catch(err){
          error = err;
        }
        return client.respond(data, response, error);
      })
    });

    this.on("unregistered_device", function*(client){
      try{
        yield self._client.send("base", "unregister_sub_client", {client_key : client.client_key});       
      }catch(err){
        console.log('cant unregister client !' , client.client_key , err)
      }
    })

    this._client = new Client(options.client)
    
    this._client.on("message" , function*(data){
      if(data.ns == 'base' && data.cmd == 'ping')
        return
      var fullns = data.ns.split("*");
      var client_key = fullns[1];
      data.ns        = fullns[0];
      if(client_key) { 
        this.log.info("proxy %s from %s to %s", data, client.client_key, data.client_key);
        var remote = this._clientsList[data.client_key], response, err;
        try {
          if(!remote)
              throw `Bad client '${data.client_key}'`; //maybe unregist device
          response = yield remote.send.apply(remote, [data.ns, data.cmd, data.args].concat(data.xargs));
        } catch(error) {
          err = error;
        }
        return client.respond(data, response, err);
      }
    })
  }

  connect(chain){
    var connect = this._client.connect.bind(this._client);

    var registration_parameters = {
      sub_Clients_list  : Object.keys(this._clientsList),
      address           : os.networkInterfaces().eth0[0].address,
      port              : this.options.server_port
    }

    this._client.options.registration_parameters = registration_parameters;

    var self = this;
    var failureCallback = () =>{
      if(self.connection){
        self.connection = false ;
      }
      return setTimeout(() => {

      var registration_parameters = {
        sub_Clients_list  : Object.keys(self._clientsList),
        address           : os.networkInterfaces().eth0.adress,
        port              : self.options.server_port
      }

      this.options.registration_parameters = registration_parameters;        
          connect(function() {
                self.connection = true ;
              },
              failureCallback)
        }, 4000)
    }

    if(!self.connection)
      connect(chain , failureCallback);
  }
  

}

module.exports = ProxyServer;

