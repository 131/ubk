'use strict';

const Server = require('./index');
const Client = require('../client/tcp');
const debug  = require('debug');
const map    = require('mout/object/map');
const values = require('mout/object/values');
const pluck  = require('mout/object/pluck');

class ProxyServer extends Server {

  constructor(options){
    super(options.server);

    var self = this;
    this.address = options.address;

    this.log = {
      info  : debug('ubk:server:ProxyServer'),
      error : debug('ubk:server:ProxyServer')
    };


    this.on('registered_device', function*(client, args){
      try{
        args.client_key = client.client_key; //force client_key
        yield self._client.send('base', 'register_sub_client', args);
      }catch(err){
        return client.disconnect("cant register client " + client.client_key);
      }

      console.log("register sub_client " , client.client_key);

      client.registration_parameters = args; //save registration args

      client.on('received_cmd', function*(client, data){
        if(data.ns == 'base' &&  data.cmd == 'ping')
          return;
        data.ns = { sub_client_key : client.client_key , ns : data.ns };

        var response, error;
        try{
          var response = yield self._client.send.apply(self._client, [data.ns, data.cmd, data.args].concat(data.xargs || []));
        }catch(err){
          error = err;
        }
        return client.respond(data, response, error);
      })
    });

    this.on('unregistered_device', function*(client){
      try{
        yield self._client.send('base', 'unregister_sub_client', {client_key : client.client_key});       
      }catch(err){
        console.log("cant unregister client !" , client.client_key , err)
      }
    })

    this._client = new Client(options.client)
    
    this._client.on('message' , function*(data){
      if(data.ns == 'base' && data.cmd == 'ping')
        return
      var sub_client_key = data.ns.sub_client_key;
      if(sub_client_key) {
        self.log.info("proxy %s from %s to %s", data, sub_client_key);
        var remote = self._clientsList[sub_client_key], response, err;
        try {
          if(!remote)
              throw `Bad client '${sub_client_key}'`; //maybe unregist device
          response = yield remote.send.apply(remote, [data.ns, data.cmd, data.args].concat(data.xargs || []));
        } catch(error) {
          err = error;
        }
        return self._client.respond(data, response, err);
      }
    })
  }

  * connect(){ /*chain*/

    var connect = this._client.connect.bind(this._client);
    var type    = 'slave' ;
    var address = this.address;
    var sub_Clients_list = pluck(this._clientsList, 'registration_parameters');

    var registration_parameters = {
      sub_Clients_list,
      type,
      address,
      port : this.options.server_port
    }

    this._client.options.registration_parameters = registration_parameters;

    var self = this;
    var failureCallback = () =>{
      if(self.connection)
        self.connection = false ;

      return setTimeout(() => {
        var sub_Clients_list = pluck(self._clientsList, 'registration_parameters');

        var registration_parameters = {
          sub_Clients_list,
          type,
          address,
          port : self.options.server_port
        }

        self._client.options.registration_parameters = registration_parameters;

        connect(function() {
          self.connection = true ;
        }, failureCallback)

      }, 4000)
    }

    if(!self.connection)
      connect(Function.prototype , failureCallback);
  }
  

}

module.exports = ProxyServer;