'use strict';
const defer   = require('nyks/promise/defer');
const guid    = require('mout/random/guid');

class SubClient {
  constructor(client, sub_client_key){
    this.client     = client;
    this.client_key = sub_client_key;
    this.respond = this.client.respond.bind(this.client);
  }
 
  send(ns, cmd/*, payload[, xargs..] */) {
    var args = [].slice.call(arguments);
    args[0] = args[0] + "*" + this.client_key; // ns = ns*devicekey
    return this.client.send.apply(this.client, args);
  }
}


module.exports = SubClient;
