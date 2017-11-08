'use strict';

const Server = require('./index');
const Client = require('../client/tcp');
const debug  = require('debug');
const map    = require('mout/object/map');
const values = require('mout/object/values');
const pluck  = require('mout/object/pluck');
const co     = require('co');

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
        args.client_key  = client.client_key; //force client_key
        args.export_json = client.export_json();
        yield self._client.send('base', 'register_sub_client', args);
      }catch(err){
        return client.disconnect("cant register client " + client.client_key);
      }

      console.log("register sub_client " , client.client_key);

      client.registration_parameters = args; //save registration args
      client.registration_parameters.export_json = client.export_json();

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

    this._client.on('before_registration', function(){
      self._client.options.registration_parameters = {
        sub_Clients_list  : pluck(self._clientsList, 'registration_parameters'),
        type              : 'slave',
        address           : self.address,
        port              : self.options.server_port
      }
    })

    co(this._client.start).catch((err) => {console.log(err.stack)});
    
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
          response = yield remote.send.apply(remote, [data.ns.ns, data.cmd, data.args].concat(data.xargs || []));
        } catch(error) {
          err = error;
        }
        return self._client.respond(data, response, err);
      }
    })
  }

  connect(){
    this._client.connect()
  }
  

}

module.exports = ProxyServer;