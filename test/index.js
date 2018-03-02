"use strict";
/* eslint-env node,mocha */

const expect = require('expect.js');

const range      = require('mout/array/range');
const sleep      = require('nyks/function/sleep');
const stripStart = require('nyks/string/stripStart');

const Server = require('../server');
const Client = require('../client/tcp');

var server = new Server({server_port : 0});
var port   = -1;

describe("Basic server/client chat", function() {
  this.timeout(20 * 1000); // usefull with debug

  it("must start the server", function(done) {
    server.start(function() {
      port = server.options.server_port;
      done();
    });

    server.register_rpc('base', 'crash', () => {
      throw "This is an error";
    });

    server.register_rpc('base', 'crash_with_binding', function() { //plz no bind
      throw this.message;
    }, { message : "This is an error" });

    server.register_rpc('base', 'echo', async (payload) => {
      await sleep(10);
      return payload;
    });

  });

  it("should test local rpc loopback", async () => {
    var data = await server.call("base", "echo", 22);
    expect(data).to.eql(22);
  });

  it("should test throw on invalid rpc loopback", async function() {
    try {
      await server.call("nope", "echo", 22);
      expect.fail("Never here");
    } catch (err) {
      expect(err).to.be("Invalid rpc command");
    }
  });

  it("should test simple chat & remote throw", function(done) {
    var client = new Client({server_port : port});
    console.log("Connecting client");

    client.connect();

    client.once('connected', async function() {
      var hello = await client.send("base", "echo", "Hello");
      expect(hello).to.eql("Hello");
      try {
        await client.send("base", "crash");
        expect().fail("Should have crash by now");
      } catch (error) {
        expect(error).to.eql("This is an error");
      }
      try {
        await client.send("base", "crash_with_binding");
        expect().fail("Should have crash by now");
      } catch (error) {
        expect(error).to.eql("This is an error");
      }
      done();
    });

  });

  it("should test client crash", function(done) {
    var client = new Client({server_port : port});
    client.connect();

    client.register_rpc("client", "crash", function() {
      throw "This is an error";
    });

    server.once('base:registered_client', async function(device) {
      device = server.get_client(device.client_key);
      try {
        await device.send("client", "crash");
        throw "Never here";
      } catch (err) {
        expect(err).to.eql("This is an error");
      }

      done();
    });
  });

  it("should allow client to connect", function(done) {
    var currentClients = Object.keys(server._clientsList).length;
    var client         = new Client({server_port : port});

    client.connect();

    var network_challenge = null;
    client.once('connected', () => {
      network_challenge = client.export_json();
    });

    server.once('base:registered_client', async function(device) {
      device = server.get_client(device.client_key);

      //server should respond a simple ping event
      var pong = await client.send('base', 'ping');
      expect(pong).to.eql("pong");

      //all device should respond to a ping event
      pong = await device.send("base", "ping");
      expect(pong).to.eql("pong");

      var remote_network = device.export_json();
      console.log({remote_network, network_challenge});

      var lnkPort = remote_network.remoteAddress.port;
      expect(lnkPort).to.be.ok();

      expect(network_challenge).to.eql({
        address : "127.0.0.1",
        network : {
          address : "127.0.0.1",
          family  : "IPv4",
          port    : lnkPort
        },
        port : port,
        type : "tcp"
      });

      expect(Object.keys(server._clientsList).length).to.be(currentClients + 1);
      device = server.get_client(device.client_key);
      device.disconnect();
      expect(device.export_json().remoteAddress).to.eql({});

      expect(Object.keys(server._clientsList).length).to.be(currentClients);

      //now waiting for client to figure it as been disconnected
      client.once("disconnected", function() {
        expect(client.export_json()).to.eql({});
        done();
      });
    });
  });

  it("should support a very simple rpc definition & call", function(done) {
    var client = new Client({server_port : port});

    //very simple RPC design
    //heavy computational operation goes here
    client.register_rpc("math", "sum", (a, b) => a + b);

    server.on('base:registered_client', async (device) => {
      //testing direct call
      var response = await client.call("math", "sum", 2, 7);
      expect(response).to.be(9);

      try {
        await client.call("nope", "sum", 2, 7);
        expect.fail("Never here");
      } catch (err) {
        expect(err).to.be("Invalid rpc command");
      }

      device = server.get_client(device.client_key);

      response = await device.send("math", "sum", 2, 4);
      server.off('base:registered_client');
      expect(response).to.be(6);
      device.disconnect();
      done();
    });

    client.connect();

  });

  it("should support multiple clients", function(done) {

    var pfx              = 'client_';
    var clients          = [];
    var connectedClients = 0;

    range(0,10).forEach(function(i) {
      var client = new Client({server_port : port, client_key : pfx + i});

      client.once("registered", function() {
        connectedClients++;
      });

      client.register_rpc("math", "sum", (a, b) => {
        var r = a + b + i;
        console.log("doing math in client %s#%s is %s", client.client_key, i, r);
        return r;
      });

      clients.push(client);
    });

    var checks = {};

    server.on('base:registered_client', function(device) {
      var i      = Number(stripStart(device.client_key, pfx));

      device = server.get_client(device.client_key);

      console.log("new device", device.client_key, i);

      device.send("math", "sum", 2, 4).then(function(response) {

        expect(response).to.be(6 + i);
        checks[i] = true;
        device.disconnect();

        if (Object.keys(checks).length == clients.length) {
          server.off('base:registered_client');
          console.log({connectedClients, clients : clients.length});
          expect(connectedClients).to.eql(clients.length);
          done();
        }
      });
    });

    clients.forEach(function(client) { client.connect(); });
  });

});
