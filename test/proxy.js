"use strict";
/* eslint-env node, mocha */

const expect = require('expect.js');

const Server = require('../server');
const Client = require('../client/tcp');

var server = new Server({server_port : 0});
var port   = -1;

describe("Basic server/client chat", function() {

  it("must start the server", function(done) {
    server.start(function() {
      port = server.options.server_port;
      done();
    });

    server.register_rpc('base', 'crash', function() {
      throw "This is an error";
    });

    server.register_rpc('base', 'echo', payload => payload);
  });

  it("should allow rpc proxy", function(done) {
    var dummy  = new Client({server_port : port});
    var summer = new Client({server_port : port, client_key : "summer"});

    //very simple RPC design
    //heavy computational operation goes here
    summer.register_rpc("math", "sum", (a, b) => a + b);

    summer.connect();
    summer.on('connected', function() {
      console.log("Summer connected");
      dummy.connect();
      dummy.on('connected', async function() {
        var response = await dummy.send("math:summer", "sum", 1, 2);
        expect(response).to.be(3);

        try {
          await dummy.send("math:divisor", "sum", 1, 2);
          expect().fail("Should not be here");
        } catch(err) {
          expect(err).to.eql("Bad client 'divisor'");
        }

        done();
      });

    });
  });

});
