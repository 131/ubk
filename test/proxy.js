"use strict";


const expect = require('expect.js');
const async  = require('async');
const co       = require('co');

const stripStart = require('nyks/string/stripStart');
const detach   = require('nyks/function/detach');
const range    = require('mout/array/range');

const Server = require('../server');
const Client = require('../client/tcp');



var server = new Server({server_port : 0});
var port   = -1;

function cothrow(generator){
  co(generator).catch(detach(function(error) {
    throw error;
  }));
}

describe("Basic server/client chat", function(){

  it("must start the server", function(done){
    server.start(function(){
      port = server.options.server_port;
      done();
    });

    server.register_rpc('base', 'crash', function* () {
      throw "This is an error"
    });

    server.register_rpc('base', 'echo', function* (payload){
      return Promise.resolve(payload);
    });

  });




  it("should allow rpc proxy", function(done) {
    var dummy = new Client({server_port:port});
    var summer = new Client({server_port:port, client_key: "summer"});

    //very simple RPC design
    summer.register_rpc("math", "sum", function* (a, b){
        //heavy computational operation goes here
      return Promise.resolve(a + b);
    });

    summer.connect();
    summer.on('connected', function() {
      console.log("Summer connected");
      dummy.connect();
      dummy.on('connected', function() {
        cothrow(function*(){
          var response = yield dummy.send("math:summer", "sum", 1,2);
          expect(response).to.be(3);

          try {
            yield dummy.send("math:divisor", "sum", 1,2);
            expect().fail("Should not be here");
          } catch(err){
            expect(err).to.eql("Bad client 'divisor'");
          }

          done();
        });

      });

    });


  })


});




