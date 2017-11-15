"use strict";

const http   = require('http');
const expect = require('expect.js')


global.WebSocket = require('ws');
const ClientWs = require('../client/ws');
const Server   = require('../server');
const wsServer = require('ws').Server
const co       = require('co');

const port = 3000, wsPort = 8001, wsUrl = `http://localhost:${wsPort}/`;
var server = new Server({server_port:port});

describe("Basic server/client chat for webSocket", function(){

  it("must start the server", function(done) {
    var web_sockets = new wsServer({
      server: http.createServer().listen(wsPort, done),
      path : '/',
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
   })


  it("should support a very simple rpc definition & call", function(done){

    var client = new ClientWs(wsUrl);

    //very simple RPC design

    client.register_rpc("math", "sum", function* (a, b) {
        //heavy computational operation goes here
      return Promise.resolve(a + b);
    });


    server.on('base:registered_client', function* (device) {
      device = server.get_client(device.client_key);

      var response = yield device.send("math", "sum", 2, 4);
      server.off('base:registered_client');
      expect(response).to.be(6);
      device.disconnect();
      done();
    });

     client.connect();

  })

});

