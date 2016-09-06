"use strict";

global.WebSocket = require('ws');
const ClientWs = require('../client/ws');
const expect = require('expect.js')
const Server = require('../server');

var port = 3000;
var server = new Server({server_port:port});

describe("Basic server/client chat for webSocket", function(){


  it("must start the server", function(done){
      server.start_socket_server(function(){
        done();
      });
    });


    it("should allow client to connect", function(done){


      var client = new ClientWs('http://localhost:8001/');

        server.once('base:registered_client', function(device){
            expect(Object.keys(server._clientsList).length).to.be(1);
            device = server.get_client(device.client_key);
            device.disconnect();
            expect(Object.keys(server._clientsList).length).to.be(0);
            done();
        });

        client.connect(function(){console.log('client connect')});


    })


    it("should support a very simple rpc definition & call", function(done){


      var client = new ClientWs('http://localhost:8001/');

        //very simple RPC design
        client.register_rpc("math", "sum", function(a, b, chain){
            //heavy computational operation goes here
          chain(null, a + b);
        });


        server.on('base:registered_client', function(device){
          device = server.get_client(device.client_key);
          device.call_rpc("math", "sum", [2, 4], function(error, response){
            server.off('base:registered_client');
            expect(response).to.be(6);
            device.disconnect();
            done();
          });
        });
       client.connect(function(){console.log('client connect')});

    })

});



