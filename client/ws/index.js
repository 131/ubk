"use strict";
/* eslint-env browser */

const guid    = require('mout/random/guid');

const Client      = require('../');
const WSTransport = require('./transport');

class WSClient extends Client {
  constructor(url, options) {
    options = Object.assign({
      registration_parameters : {},
    }, options);

    super(options);

    this.url         = '';
    this._socket     = null;
    this.client_key  = null;
    this.url         = url.replace('http','ws') ;
    this.client_key  = guid();
  }

  async transport() {
    // Secured or clear method ?
    var socket = new WebSocket(this.url);

    await new Promise((resolve) => {
      socket.onopen = resolve;
    });

    return new WSTransport(socket);
  }
}

module.exports = WSClient;
