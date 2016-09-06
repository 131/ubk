"use strict";

const expect = require('expect.js')
const async  = require('async')
const stripStart = require('nyks/string/stripStart');
const detach   = require('nyks/function/detach');
const range   = require('mout/array/range');
const co    = require('co');

const Server = require('../server');
const Client = require('../client/tcp');

global.WebSocket = require('ws');

const ClientWs = require('../client/ws');


var http   = require('http');

var port = 3000;
var server = new Server({server_port:port});

describe("Basic server/client chat", function(){

  it("must start the server", function(done){
    server.start(function(){
      done();
    });

    server.register_cmd('base', 'crash', function(device, query){
      device.respond(query, null, "This is an error");
    });


    server.register_cmd('base', 'echo', function(device, query){
      device.respond(query, query.args);
    });

  });



  it("should trigger client echo", function(done){
    var client = new Client({server_port:port});

    client.connect(function(){
      client.send("base", "echo", "Hi !", function(response, error){
        expect(response).to.be("Hi !");
        expect(error).not.to.be.ok();
        done();
      });
    });
  })




  it("should trigger client send error", function(done){
    var client = new Client({server_port:port});

    client.connect(function(){
      client.send("base", "crash", {}, function(response, error){
        expect(error).to.be("This is an error");
        expect(response).not.to.be.ok();
        done();
      });
    });
  })







  it("should test for promise support", function(done){
    var client = new Client({server_port:port});

    client.connect(function() {
      co(function*(){
        var hello = yield client.send("base", "echo", "Hello");
        expect(hello).to.eql("Hello");

        try {
          yield client.send("base", "crash");
          expect("Never be here").to.eql("true");
        } catch(error){
          expect(error).to.eql("This is an error");
        }

        done();

      }).catch(detach(function(error) {
        throw error;
      }));
    });

  })



  it("should allow client to connect", function(done){
    var currentClients = Object.keys(server._clientsList).length;
    var client = new Client({server_port:port});

    server.once('base:registered_client', function(device){
        expect(Object.keys(server._clientsList).length).to.be(currentClients + 1);
        device = server.get_client(device.client_key);
        device.disconnect();
        expect(Object.keys(server._clientsList).length).to.be(currentClients);
        done();
    });
    client.connect();
  })


  it("should support a very simple rpc definition & call", function(done){
    var client = new Client({server_port:port});

    //very simple RPC design
    client.register_rpc("math", "sum", function(a, b, chain){
        //heavy computational operation goes here
      chain(null, a + b);
    });


    server.on('base:registered_client', function(device){
      device = server.get_client(device.client_key);
      device.send("math", "sum", [2, 4], function(response, error){
        expect(error).not.to.be.ok();
        server.off('base:registered_client');
        expect(response).to.be(6);
        device.disconnect();
        done();
      });
    });
    client.connect();

  })









 it("should support multiple clients", function(done){
    var pfx = 'client_', clients = [], connectedClients = 0;

    range(0,10).forEach( function(i){
      var client = new Client({server_port:port, client_key:pfx + i});

      client.once("registered", function(){
        connectedClients ++;
      });

      client.register_rpc("math", "sum", function(a, b, chain){
        var r = a + b + i;
        console.log("doing math in client %s#%s is %s", client.client_key, i, r);
        chain(null, r);
      });
      clients.push(client);
    });

    var checks = {};

    server.on('base:registered_client', function(device){
      var i = Number(stripStart(device.client_key, pfx)),
          device = server.get_client(device.client_key);

      console.log("new device", device.client_key, i);

      device.send("math", "sum", [2, 4], function(response, error){

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




