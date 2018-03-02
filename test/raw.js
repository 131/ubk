"use strict";
/* eslint-env node, mocha */

const expect = require('expect.js');
const net    = require('net');

const trim       = require("mout/string/trim");
const defer      = require('nyks/promise/defer');

const Server = require('../server');
const Client = require('../client/tcp');

const DELIMITER = String.fromCharCode(27);

var server = new Server({server_port : 0});
var port   = -1;

describe("Raw server/client chat", function() {

  it("must start the server", function(done) {
    server.start(function() {
      port = server.options.server_port;
      done();
    });

    server.register_rpc('base', 'crash', () => {
      throw "This is an error";
    });

    server.register_rpc('base', 'echo', payload => payload);
  });

  it("should reject client that miss registration ack", function(done) {

    server.once('base:registered_client', function() {
      expect().fail("Should not be here");
    });

    const client = net.connect({port}, () => {
      // 'connect' listener
      console.log('connected to server!');
      client.write(JSON.stringify("Something"));
      client.write(String.fromCharCode(27));
    });
    // we'll get disconnected very quickly
    client.on('end', function() {
      server.off('base:registered_client');
      done();
    });

  });

  it("should disconnect a client that register multiple times", function(done) {

    var client = new Client({server_port : port, client_key : "foo"});
    var next   = function(what) {
      next[what] = true;
      if(next["error"] && next["disconnect"])
        done();
    };

    client.connect();
    client.once('connected', async function() {
      try {
        await client.send("base", "register", {client_key : "foo" });
        expect().fail("Should not be connected");
      } catch(err) {
        expect(err).to.match(/Already registered client/);
        next("error");
      }
    });

    client.once('disconnected', function() {
      next("disconnect");
      client.disconnect();
    });

  });

  it("should reject prevent two clients to use the same client_key", async function() {
    var defered = defer();
    var clienta = new Client({server_port : port, client_key : "AAA"});
    var clientb = new Client({server_port : port, client_key : "AAA"});

    console.log("Connecting client");

    clienta.connect();
    clienta.on('connected', async () => {

      var response = await clienta.send("base", "echo", "Hellow");
      expect(response).to.eql("Hellow");

      clientb.connect();
      clientb.on('connected', function() {
        expect().fail("Should not be connected");
      });

      clientb.once('disconnected', function(err) {
        expect(err).to.match(/Client 'AAA' already exists/);

        expect(Object.keys(server._clientsList).length).to.be(1); //only clienta
        clientb.disconnect();
        defered.resolve();
      });
    });

    return defered;
  });

  it("should reject client that with corrupted registration ack", function(done) {

    var next = function(what) {
      next[what] = true;
      if(next["error"] && next["disconnect"])
        done();
    };

    server.once('base:registered_client', function() {
      expect().fail("Should not be here");
    });

    const client = net.connect({port}, () => {
      // 'connect' listener
      console.log('connected to server!');
      client.write(JSON.stringify({cmd : "register", ns : "base", args : {client_key : null }}));
      client.write(DELIMITER);
    });

    client.on("data", function(buf) {
      expect(JSON.parse(trim(buf.toString(), DELIMITER)) .error).to.eql("No id for client to register");
      next("error");
    });

    client.on('end', function() {
      server.off('base:registered_client');
      next("disconnect");
    });

  });

});
