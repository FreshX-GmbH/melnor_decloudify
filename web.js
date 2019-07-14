'use strict';

const fs = require('fs');
const http = require('http');
const staticFiles = require('node-static');
const file = new staticFiles.Server('./www');
const crypto = require('crypto');
const WebSocket = require('ws');
const querystring = require('querystring');

const { QLog, undefinedOrNull } = require('quanto-commons');

const weblog = QLog.scope('WEB');
const wslog = QLog.scope('WS');
const restlog = QLog.scope('REST');

const wss = new WebSocket.Server({ noServer: true });

const settings = require('./settings.json');

const CMD_OFF = 0x000;
const CMD_ON = 0x307;

let wsConnected = false;
let online = false;
let state = 0;
let client;

const server = http.createServer((req, res) => {
  weblog.debug('New request : ', req.url);
  if (req.url.startsWith("/REST")) {
	  const opts = querystring.parse(req.url.replace(/.*REST./, 'type=').replace(/\?/, '&'));
	  restlog.debug('Rest API call with opts', opts);
	  if(online) {
    		wss.clients.forEach(function each(client) {
	  	    if(opts.type === 'ON') {
	 	 	restlog.pending(`SET CH ${opts.channel} to : ${opts.type} for ${opts.min} minutes.`);
		    	wslog.pending('Sending an ON message for channel', opts.channel, 'runtime', opts.min);
        	    	client.send(JSON.stringify(constructEvent('manual_sched', CMD_ON, opts.channel, opts.min)));
	 	    } else {
	 	 	restlog.pending(`SET CH ${opts.channel} to : ${opts.type}`);
		    	wslog.pending('Sending an OFF message for channel', opts.channel);
        	    	client.send(JSON.stringify(constructEvent('manual_sched', CMD_OFF, opts.channel, 0)));
	 	    }
		});
	  	return res.end('OK');
	  }
	  wslog.error('Device handshake in progress or device not yet connected.');
	  return res.end('Device not connected (yet).');
  }
  if (req.url.startsWith("/submit")) {

	if(wsConnected == false) {
		wslog.error('Device not in sync. Please reset or wait.');
	  	return res.end('OK');
	}

	const id = req.url.replace(/.*idhash=/, '').replace(/.message.*/, '');
	state = req.url.replace(/.*message=/, '');

	if(state.startsWith("ascii--manualctrlevnt--ack--null")) {
		weblog.success('Device sent event ack.');
    		//wss.clients.forEach(function each(client) {
        	//	client.send(JSON.stringify(constructEvent('manual_sched', CMD_ON, 0)));
        		// client.send(JSON.stringify({"event":"rev_request","data":"\"\"","channel":settings.mac}));
		//});
  		return res.end('OK');
	}
	if(state.startsWith("ascii--revisions--E400")) {
		weblog.debug('Device sent revisions-E400 reply.');
    //		wss.clients.forEach(function each(client) {
    //    		client.send(JSON.stringify(constructEvent('manual_sched', CMD_OFF, 0)));
    //		});
  		return res.end('OK');
	}
	const binState = Buffer.from(state, 'base64').slice(6);
	weblog.complete(`Device with hash ${id} online, state : ${binState.toString('hex').replace(/(.{4})/g,"$1:").replace(/:$/, '')}`);
    	online = true;
  }
  return res.end('OK');
});

wss.on('connection', function connection(ws) {
    wsConnected = true;
    ws.on('message', function incoming(data) {
	wslog.debug('WS message', JSON.stringify(data));
    	wss.clients.forEach(function each(client) {
		// Test if data contains subscribe request
       	    wslog.debug('new message from',client._socket.remoteAddress);
//      	    if (client !== ws && client.readyState === WebSocket.OPEN) {
		wslog.pending('Received subscribe request. Sending ack.');
		client.send(JSON.stringify({"event":"pusher_internal:subscription_succeeded","data":"{}","channel":settings.mac}));
		client.send(JSON.stringify({"event":"hash_key","data":"\"53f574cb08\"","channel":settings.mac}));
//      	    }
        });
    });
    wslog.debug('WS connection');
});

exports.start = function () {
  server.listen(settings.port, () => {
    weblog.success(`listening on 0.0.0.0:${settings.port}`);
  });

  server.on('upgrade', (req, socket, head) => {
    weblog.success('WebSocket upgrade request from', socket.remoteAddress);
    // if (req.headers['upgrade'] !== 'websocket' || req.headers['upgrade'] !== 'WebSocket') {
    if (req.headers['upgrade'] !== 'WebSocket') {
	console.log('Bad request:', req.headers);
        socket.end('HTTP/1.1 400 Bad Request');
        return;
    }
    wss.handleUpgrade(req, socket, head, function done(ws) {
      wss.clients.forEach(function each(client) {
      	wslog.pending('Initiating WS handshake with',client._socket.remoteAddress);
	client.send(JSON.stringify({"event":"pusher:connection_established","data":"{\"socket_id\":\"265218.826472\"}"}));
      });
      wss.emit('connection', ws, req);
    });
  });
}

function constructEvent (typ, cmd, channel, min) {
  const ev = {
          event: typ,
	  channel: settings.mac,
  }
  const buffer = Buffer.alloc(18);
  buffer.writeUInt16LE(cmd,2+2*channel);
  buffer.writeUInt16LE(parseInt(settings.valveId,16));
  ev.data = `\"${buffer.toString('base64')}\"`;
  console.log(JSON.stringify(ev));
  return ev;
}

