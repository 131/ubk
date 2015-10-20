"use strict";

var expect = require('expect.js')
var async  = require('async')
var stripStart = require('nyks/string/stripStart');
var range   = require('mout/array/range');

var Server = require('../lib/server');
var Client = require('../lib/client/tcp');
var ClientWs = require('../lib/client/ws');

var http   = require('http');

var port = 3000;
var server = new Server({server_port:port});

describe("Basic server/client chat", function(){

    it("must start the server", function(done){
      server.start(function(){
        done();
      });
    });


    it("should allow client to connect", function(done){
        var client = new Client({server_port:port});

        server.once('base:registered_client', function(device){
            expect(Object.keys(server._clientsList).length).to.be(1);
            device = server.get_client(device.client_key);
            device.disconnect();
            expect(Object.keys(server._clientsList).length).to.be(0);
            done();
        });
        client.connect();
    })


    it("should support a very simple rpc definition & call", function(done){

        var client = new Client({server_port:port});

        //very simple RPC design
        client.register_rpc("math", "sum", function(a, b, chain){
            //heavy computational operation goes here
          chain(a + b);
        });

        server.on('base:registered_client', function(device){
          device = server.get_client(device.client_key);
          device.call_rpc("math", "sum", [2, 4], function(reponse){
            server.off('base:registered_client');
            expect(reponse).to.be(6);
            device.disconnect();
            done();
          });
        });
        client.connect();

    })


   it("should support multiple clients", function(done){
        var pfx = 'client_', clients = [];

        range(0,10).forEach( function(i){
          var client = new Client({server_port:port, client_key:pfx + i});

          client.register_rpc("math", "sum", function(a, b, chain){
            var r = a + b + i;
            console.log("doing math in client %s#%s is %s", client.client_key, i, r);
            chain(r);
          });
          clients.push(client);
        });

        var checks = {};

        server.on('base:registered_client', function(device){
          var i = Number(stripStart(device.client_key, pfx)),
              device = server.get_client(device.client_key);

          console.log("new device", device.client_key, i);

          device.call_rpc("math", "sum", [2, 4], function(reponse){
            console.log('aaaaaa' , i)
            expect(reponse).to.be(6 + i);
            checks[i] = true;
            device.disconnect();

            if(Object.keys(checks).length == clients.length){
              server.off('base:registered_client');
              done();}
          });
        });
        clients.forEach(function(client){ client.connect()});
    });
});



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
          chain(a + b);
        });


        server.on('base:registered_client', function(device){
          device = server.get_client(device.client_key);
          device.call_rpc("math", "sum", [2, 4], function(reponse){
            server.off('base:registered_client');
            expect(reponse).to.be(6);
            device.disconnect();
            done();
          });
        });
       client.connect(function(){console.log('client connect')});

    })

/*
     /*it("should support multiple clients", function(done){
        var pfx = 'client_', clients = [];

        range(0,10).forEach( function(i){
          var client = new ClientWs('http://localhost:8001/');

          client.register_rpc("math", "sum", function(a, b, chain){
            var r = a + b + i;
            console.log("doing math in client %s#%s is %s", client.client_key, i, r);
            chain(r);
          });
          clients.push(client);
        });

        var checks = {};

        server.on('base:registered_client', function(device){
          var i = Number(stripStart(device.client_key, pfx)),
              device = server.get_client(device.client_key);

          console.log("new device", device.client_key, i);

          device.call_rpc("math", "sum", [2, 4], function(reponse){
            expect(reponse).to.be(6 + i);
            checks[i] = true;
            device.disconnect();
            if(Object.keys(checks).length == clients.length)
              done();
          });
        });
        clients.forEach(function(client){ client.connect(function(){})});
    });*/


});
