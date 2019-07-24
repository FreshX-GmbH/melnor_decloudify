'use strict';

const dns = require('native-dns');
const async = require('async');
const settings = require('./settings.json');

const { QLog, undefinedOrNull } = require('quanto-commons');

const log = QLog.scope('DNS');

log._enableLog(settings.loglevel);

const dnsServer = dns.createServer();

const authority = {
	address: settings.dnsForwarder,
	port: 53,
	type: 'udp'
};

const entries = [
  {
    domain: "^wifiaquatimer.com.*",
    records: [
      { type: "A", address: settings.myIP, ttl: 1800 }
    ]
  },
  {
    domain: "^ws.pusherapp.com.*",
    records: [
      { type: "A", address: settings.myIP, ttl: 1800 }
    ]
  }
];

const handleDNSRequest = function (request, response) {
  let f = [];
  request.question.forEach(question => {
    let entry = entries.filter(r => new RegExp(r.domain, 'i').exec(question.name));
    if (entry.length && settings.enabled === true) {
      entry[0].records.forEach(record => {
        record.name = question.name;
        record.ttl = record.ttl || 1800;
        if (record.type == 'CNAME') {
          record.data = record.address;
          f.push(cb => proxy({ name: record.data, type: dns.consts.NAME_TO_QTYPE.A, class: 1 }, response, cb));
        }
        response.answer.push(dns[record.type](record));
        log.debug('DNS request from', request.address.address, 'for DNS', request.question[0].name, ' spoofing to =>', record.address);
      });
    } else {
      f.push(cb => proxy(question, response, cb));
      log.debug('forwarding request from', request.address.address, 'for', request.question[0].name);
    }
  });

  async.parallel(f, function() { response.send(); });
}

const proxy = function (question, response, cb) {
//  question.type = 'A';
  log.info('proxying', JSON.stringify(question));
  log.debug('via', JSON.stringify(authority));

  const request = dns.Request({
    question, // forwarding the question
    server: authority,  // this is the DNS dnsServer we are asking
    timeout: 1000
  });

  // when we get answers, append them to the response
  request.on('message', (err, msg) => {
    msg.answer.forEach(a => response.answer.push(a));
    log.debug('New DNS response :', JSON.stringify(msg.answer)); 
  });

  request.on('end', cb);
  request.send();
}

exports.start = function () {
  dnsServer.on('listening', () => log.success('listening on', dnsServer.address().address, 'port', dnsServer.address().port));
  dnsServer.on('close', () => console.log('dnsServer closed', dnsServer.address()));
  dnsServer.on('error', (err, buff, req, res) => console.error(err.stack));
  dnsServer.on('socketError', (err, socket) => console.error(err));

  dnsServer.serve(53);
  dnsServer.on('request', handleDNSRequest);
}
