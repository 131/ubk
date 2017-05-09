'use strict';

class subClient {
  constructor(client, sub_client_key){
    this.client     = client;
    this.client_key = sub_client_key;
    this.respond = this.client.respond.bind(this.client);
  }
 
  send(ns, cmd/*, payload[, xargs..] */) {
    var xargs = [].slice.call(arguments, 2),
      args  = xargs.shift();

    var promise = defer();
    var quid = guid();
    ns = ns + "*" + this.client_key;
    var query = {ns, cmd, quid, args, xargs };

    this.client._call_stack[quid] = { ns, cmd, promise };

    if(!(query.ns == 'base' && query.cmd == 'ping'))
      this.log.info("Send msg '%s*%s' to %s ", query.ns, query.cmd, this.client.client_key, this.client_key);

    this.client.write(query);
    return promise;
  }
}