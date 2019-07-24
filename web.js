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

const CMD_OFF = 0x00;
const CMD_ON = 0x02;

let firstSubscribe = false;
let heloTimeout = false;
let timeout = 30;
let wsConnected = false;
let online = false;
let state = 0;
let client;

const server = http.createServer((req, res) => {
  weblog.debug('New request : ', req.url);
  // Our REST server
  if (req.url.startsWith("/REST")) {
	  const opts = querystring.parse(req.url.replace(/.*REST./, '').replace(/\?/, '&'));
	  restlog.debug('Rest API call with opts', JSON.stringify(opts));
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
  // Melnor Submit route
  if (req.url.startsWith("/submit")) {
	const id = req.url.replace(/.*idhash=/, '').replace(/.message.*/, '');
	state = req.url.replace(/.*message=/, '');

	if(state.endsWith("ack--null")) {
		const ackType = state.replace(/ascii--/, '').replace(/--ack--null/, '');
		weblog.success(`Device sent event ack for ${ackType}.`);
  		return res.end('OK');
	}

	if(wsConnected == false) {
		wslog.error('Device not in sync. Please reset or wait.');
	  	return res.end('OK');
	}
	if(firstSubscribe == true) {
		// TODO : generate random hash_key?
		sendMessage(wss.clients, "hash_key", settings.mac, settings.mac);
		firstSubscribe = false;
  		return res.end('OK');
	}
	//if(heloTimeout == true) {
		//sendMessage(wss.clients, "timestamp", Buffer.from(0x1758).toString('base64'), settings.mac);
	//	heloTimeout = false;
  	//	return res.end('OK');
	//}

	if(state.startsWith("ascii--revisions--E400")) {
		// Whatever that is...
		weblog.debug('Device sent revisions-E400.');
  		return res.end('OK');
	}
	// const binState = Buffer.from(state, 'base64').slice(6);
	const binState = Buffer.from(state, 'base64');
	weblog.complete(`Device with hash ${id} online, state : ${binState.toString('hex').replace(/(.{4})/g,"$1:").replace(/:$/, '')}`);
    	online = true;
  }
  return res.end('OK');
});

wss.on('connection', function connection(ws) {
    wsConnected = true;
    wslog.debug('WS connection established');
    ws.on('message', function incoming(data) {
	const msg = JSON.parse(data);
	wslog.debug('New WS event', msg.event)
	switch (msg.event) {
	    case "pusher:subscribe":
		wslog.pending('Received subscribe request.');
		sendMessage(wss.clients, "pusher_internal:subscription_succeeded","{}",settings.mac);
		firstSubscribe = true;
		break;
	    default:
		wslog.error('I dont know how to handle this event.');
		break;
	}
    });
});

function checkTimeout() {
	if(heloTimeout === false) {
		timeout = 30;
		heloTimeout = true;
	} else {
		timeout -= 5;
	}
}

exports.start = function () {
  setInterval(checkTimeout, 5000);
  server.listen(settings.port, () => {
    weblog.success(`listening on 0.0.0.0 port ${settings.port}`);
  });

  server.on('upgrade', (req, socket, head) => {
    weblog.success('WebSocket upgrade request from', socket.remoteAddress.replace(/.*:/, ''));
    // if (req.headers['upgrade'] !== 'websocket' || req.headers['upgrade'] !== 'WebSocket') {
    if (req.headers['upgrade'] !== 'WebSocket') {
	console.log('Bad request:', req.headers);
        socket.end('HTTP/1.1 400 Bad Request');
        return;
    }
    wss.handleUpgrade(req, socket, head, function done(ws) {
        sendMessage(wss.clients, 'connection_established', '{}');
        wss.emit('connection', ws, req);
    });
  });
}

function sendMessage (clients, event, data, channel = ''){
    clients.forEach(function each(wsClient) {
        wslog.pending(`Sending new message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
        wsClient.send(JSON.stringify({"event":event, "data": data, "channel": channel}));
    });
}

function constructEvent (typ, cmd, channel, min) {
  const ev = {
          event: typ,
	  channel: settings.mac,
  }
  const buffer = Buffer.alloc(18);
  buffer.writeUInt8(cmd,2*channel+1);
  buffer.writeUInt8(min,2*channel);
  buffer.writeUInt16LE(parseInt(settings.valveId,16));
  ev.data = `\"${buffer.toString('base64')}\"`;
  console.log(JSON.stringify(ev));
  weblog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g,"$1:").replace(/:$/, '')}`);
  return ev;
}

