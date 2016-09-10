"use strict";


const expect = require('expect.js');
const async  = require('async');
const co       = require('co');

const stripStart = require('nyks/string/stripStart');
const detach   = require('nyks/function/detach');
const range    = require('mout/array/range');

const Server = require('../server');
const Client = require('../client/tcp');



var port = 3000;
var server = new Server({server_port:port});

function cothrow(generator){
  co(generator).catch(detach(function(error) {
    throw error;
  }));
}

describe("Basic server/client chat", function(){

  it("must start the server", function(done){
    server.start(function(){
      done();
    });

    server.register_rpc('base', 'crash', function* () {
      throw "This is an error"
    });

    server.register_rpc('base', 'echo', function* (payload){
      return Promise.resolve(payload);
    });

  });


  it("should test simple chat", function(done){
    var client = new Client({server_port:port});
    console.log("Connecting client");

    client.connect(function() {

      cothrow(function*() {

        var hello = yield client.send("base", "echo", "Hello");
        expect(hello).to.eql("Hello");

        try {
          yield client.send("base", "crash");
          expect().fail("Should have crash by now")
        } catch(error){
          expect(error).to.eql("This is an error");
        }
        done();
      });

    });

  })



  it("should allow client to connect", function(done){
    var currentClients = Object.keys(server._clientsList).length;
    var client = new Client({server_port:port});

    server.once('base:registered_client', function(device){
      device = server.get_client(device.client_key);

      cothrow(function*(){

          //server should respond a simple ping event
        var pong = yield client.send('base', 'ping');
        expect(pong).to.eql("pong");

          //all device should respond to a ping event
        var pong = yield device.send("base", "ping");
        expect(pong).to.eql("pong");

        expect(Object.keys(server._clientsList).length).to.be(currentClients + 1);
        device = server.get_client(device.client_key);
        device.disconnect();

        expect(Object.keys(server._clientsList).length).to.be(currentClients);
        done();
      });
    });
    client.connect();
  })


  it("should support a very simple rpc definition & call", function(done){
    var client = new Client({server_port:port});

    //very simple RPC design
    client.register_rpc("math", "sum", function* (a, b){
        //heavy computational operation goes here
      return Promise.resolve(a + b);
    });


    server.on('base:registered_client', function(device){
      device = server.get_client(device.client_key);

      cothrow(function*() {
        var response = yield device.send("math", "sum", 2, 4);
        server.off('base:registered_client');
        expect(response).to.be(6);
        device.disconnect();
        done();
      });

    });
    client.connect();

  })


  it("should support multiple clients", function(done) {
    var pfx = 'client_', clients = [], connectedClients = 0;

    range(0,10).forEach( function(i){
      var client = new Client({server_port:port, client_key:pfx + i});

      client.once("registered", function(){
        connectedClients ++;
      });

      client.register_rpc("math", "sum", function*(a, b) {
        var r = a + b + i;
        console.log("doing math in client %s#%s is %s", client.client_key, i, r);
        return Promise.resolve(r);
      });

      clients.push(client);
    });

    var checks = {};

    server.on('base:registered_client', function(device){
      var i = Number(stripStart(device.client_key, pfx)),
          device = server.get_client(device.client_key);

      console.log("new device", device.client_key, i);

      device.send("math", "sum", 2, 4).then(function(response){

        expect(response).to.be(6 + i);
        checks[i] = true;
        device.disconnect();

        if(Object.keys(checks).length == clients.length){
          server.off('base:registered_client');
          console.log({connectedClients, clients: clients.length});
          expect(connectedClients).to.eql(clients.length);
          done();
        }
      });
    });

    clients.forEach(function(client){ client.connect()});
  });



});




