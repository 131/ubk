'use strict';

const debug  = require('debug');

const pluck  = require('mout/object/pluck');

const Client = require('../client/tcp');
const Server = require('./index');

const log = {
  info  : debug('ubk:server:ProxyServer'),
  error : debug('ubk:server:ProxyServer')
};

class ProxyServer extends Server {

  constructor(options) {
    super(options.server);

    var self = this;
    this.address = options.address;

    this.on('registered_device', async function(client, args) {
      try {
        args.client_key  = client.client_key; //force client_key
        args.export_json = client.export_json();
        await self._client.send('base', 'register_sub_client', args);
      } catch(err) {
        return client.disconnect("cant register client " + client.client_key);
      }

      log.info("register sub_client", client.client_key);

      client.registration_parameters = args; //save registration args
      client.registration_parameters.export_json = client.export_json();

      client.on('received_cmd', async (client, data) => {
        if(data.ns == 'base' &&  data.cmd == 'ping')
          return;
        data.ns = {sub_client_key : client.client_key, ns : data.ns};

        var response;
        var error;
        try {
          response = await this._client.send.apply(this._client, [data.ns, data.cmd, data.args].concat(data.xargs || []));
        } catch(err) {
          error = err;
        }
        return client.respond(data, response, error);
      });
    });

    this.on('unregistered_device', async (client) => {
      try {
        await this._client.send('base', 'unregister_sub_client', {client_key : client.client_key});
      } catch(err) {
        log.error("cant unregister client !", client.client_key, err);
      }
    });

    this._client = new Client(options.client);

    this._client.on('before_registration', () => {
      this._client.options.registration_parameters = {
        sub_Clients_list : pluck(this._clientsList, 'registration_parameters'),
        type             : 'slave',
        address          : this.address,
        name             : options.name,
        port             : this.options.server_port
      };
    });

    this._client._run().catch((err) => log.error(err.stack));

    this._client.on('message', async (data) => {
      if(data.ns == 'base' && data.cmd == 'ping')
        return;
      var sub_client_key = data.ns.sub_client_key;
      if(sub_client_key) {
        log.info("proxy %s from %s to %s", data, sub_client_key);
        var remote = this._clientsList[sub_client_key];
        var response;
        var error;
        try {
          if(!remote)
            throw `Bad client '${sub_client_key}'`; //maybe unregist device
          response = await remote.send.apply(remote, [data.ns.ns, data.cmd, data.args].concat(data.xargs || []));
        } catch(err) {
          error = err;
        }
        return this._client.respond(data, response, error);
      }
    });
  }

  connect() {
    this._client.connect();
  }

}

module.exports = ProxyServer;
