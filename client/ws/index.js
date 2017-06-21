"use strict";


const guid    = require('mout/random/guid');
const once    = require('nyks/function/once');
const merge   = require('mout/object/merge');
const defer   = require('nyks/promise/defer');

const Client  = require('../');
const WSTransport = require('./transport');



class WSClient extends Client{
  constructor(url , options){
    options = Object.assign({
      registration_parameters : {},
    }, options);
    super(options)
    this.url = '';
    this._socket = null;
    this.client_key = null;
    this.url = url.replace('http','ws') ;
    this.client_key  = guid();
  }

  * transport () {
    this.log.info('try to connect !!');
    // Secured or clear method ?
    var socket = new WebSocket(this.url) ;
    var connect = defer();
    socket.onopen = connect.resolve

    yield connect;

    return new WSTransport(socket);
  }
}



module.exports = WSClient;