"use strict";


const expect = require('expect.js');
const async  = require('async');
const co       = require('co');

const stripStart = require('nyks/string/stripStart');
const detach   = require('nyks/function/detach');
const range    = require('mout/array/range');

const Server = require('../server');
const Client = require('../client/tcp');


var port = 3003;
var server = new Server({server_port:port});

function cothrow(generator){
  co(generator).catch(detach(function(error) {
    throw error;
  }));
}

describe("Basic server/client chat", function(){
  this.timeout(20 * 1000)

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


  it("should disconnect a client that register multiple times", function(done) {

    var client = new Client({server_port:port});
    co(client.start).catch((err) => {expect(false).to.be(true)});

    var loop = 0;
    function dostuff(){
      if(loop++ == 10)
        return done();

      client.connect()
      client.on('connected', function() {
        client.disconnect();
        client.disconnect();
      })

      client.on('disconnected', function(){
        setTimeout(function(){ //let 20ms for the server to process
            expect(Object.keys(server._clientsList).length).to.be(0);
            dostuff();
        }, 20);
      })
    }

    dostuff();



  })



});




