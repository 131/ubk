"use strict";
/* eslint-env node, mocha */

const expect = require('expect.js');
const http   = require('http');

global.WebSocket = require('ws');
const WsServer   = require('ws').Server;

const ClientWs = require('../client/ws');
const Server   = require('../server');

const port   = 3000;
const wsPort = 8001;
const wsUrl  = `http://localhost:${wsPort}/`;

var server = new Server({server_port : port});

describe("Basic server/client chat for webSocket", function() {

  it("must start the server", function(done) {
    var web_sockets = new WsServer({
      server : http.createServer().listen(wsPort, done),
      path   : '/'
    });
    web_sockets.on('connection', server.new_websocket_client);
  });


  it("should allow client to connect", function(done) {
    var client = new ClientWs(wsUrl);

    server.once('base:registered_client', function(device) {
      expect(Object.keys(server._clientsList).length).to.be(1);
      device = server.get_client(device.client_key);
      device.disconnect();
      expect(Object.keys(server._clientsList).length).to.be(0);
      done();
    });

    client.connect();
  });


  it("should support a very simple rpc definition & call", function(done) {

    var client = new ClientWs(wsUrl);

    //very simple RPC design
    //heavy computational operation goes here
    client.register_rpc("math", "sum", (a, b) => a + b);


    server.on('base:registered_client', async (device) => {
      device = server.get_client(device.client_key);

      var response = await device.send("math", "sum", 2, 4);
      server.off('base:registered_client');
      expect(response).to.be(6);
      device.disconnect();
      done();
    });

    client.connect();
  });

});

