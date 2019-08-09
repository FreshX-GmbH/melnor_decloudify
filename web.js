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
let firstClear = false;
let heloTimeout = false;
let timeStamp = false;
let remoteStamp = 0;
let timeout = 60;
let wsConnected = false;
let online = false;
let state = 0;
let client;
let SM=0;
let ping = false;

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
		weblog.success(`Device sent event ack for ${ackType} device time : ${remoteStamp}.`);
  	//	return res.end('OK');
	}

	if(wsConnected === false) {
		wslog.error('Device not in sync. Please reset or wait.');
	  	return res.end('OK');
	}
	if(firstSubscribe === true) {
		// TODO : generate random hash_key?
		sendMessage(wss.clients, "hash_key", settings.mac, settings.mac);
		firstSubscribe = false;
		// Force a timeevent
		heloTimeout = -1;
  		return res.end('OK');
	}
	if(SM === 0) {
        	sendLongMessage(wss.clients,'sched_day0', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 1) {
        	sendLongMessage(wss.clients,'sched_day1', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 2) {
        	sendLongMessage(wss.clients,'sched_day2', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 3) {
        	sendLongMessage(wss.clients,'sched_day3', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 4) {
        	sendLongMessage(wss.clients,'sched_day4', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 5) {
        	sendLongMessage(wss.clients,'sched_day5', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 6) {
        	sendLongMessage(wss.clients,'sched_day6', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 7) {
        	sendMessage(wss.clients,'manual_sched', 0);
		SM++;
  		return res.end('OK');
	}
	if(SM === 8) {
		firstClear = true;
		timeStamp = 512;
		sendTimestamp(timeStamp);
		SM++;
  		return res.end('OK');
	}
	if(SM === 9) {
        	sendMessage(wss.clients,'rev_request', '');
		SM++;
  		return res.end('OK');
	}
	// why?
	if(heloTimeout === true) {
		wslog.debug('Sending timestamp update.');
		sendTimestamp(timeStamp);
		heloTimeout = false;
  		return res.end('OK');
	}

	if(state.startsWith("ascii--revisions--E400")) {
		// Whatever that is...
		weblog.debug('Device sent revisions-E400.');
  		return res.end('OK');
	}
	const binState = Buffer.from(state, 'base64');
	weblog.complete(`Device with hash ${id} online, state : ${binState.toString('hex').replace(/(.{4})/g,"$1:").replace(/:$/, '')}`);
    	online = true;
	remoteStamp = binState[8] + binState[9] * 256;
  }
  return res.end('OK');
});

wss.on('connection', function connection(ws) {
        wsConnected = true;
        wslog.debug('New WS connection established');
        ws.on('pong',function(mess) { 
            wslog.pending(`received a pong : ${mess}`); 
            }
        );
        ws.on('ping',function(mess) { 
            wslog.pending(`received a ping : ${mess}`); 
            }
        );

        ws.on('message', function incoming(data) {
            const msg = JSON.parse(data);
            wslog.debug('New WS event', msg.event)
            switch (msg.event) {
                case "pusher:subscribe":
    		if(!online) {
            	    wslog.pending('Received subscribe request.');
            	    sendMessage(wss.clients, "pusher_internal:subscription_succeeded","{}",settings.mac);
            	    firstSubscribe = true;
            	    online = false;
            	    SM=0;
		} else {
            	    wslog.pending('Ignoring subscribe request.');
		}
            	break;
            default:
            	wslog.error('I dont know how to handle this event.');
            	break;
            }
        });
});

function sendTimestamp(ts) {
	const b = Buffer.alloc(4);
  	b.writeUInt16LE(parseInt(ts,10));
	sendMessage(wss.clients, "timestamp", b.toString('base64'), settings.mac);
}

function checkTimeout() {
	weblog.debug(`Timeout called : our time:${timeStamp} <-> dev time:${remoteStamp}`);
	if(timeout < 0) {
		timeout = 30;

		if(ping === true) {
			ping = false;
			if(online === true) {
			    wslog.debug('Sending ping.');
			    sendPing(wss.clients);
			}
		} else {
			ping = true;
			if(online === true)
			    heloTimeout = false;
			    if(timeStamp) {
			        wslog.debug('Sending timestamp update.');
			        timeStamp++;
			        sendTimestamp(timeStamp);
			    }
		}
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
    	    if(!online) {
                sendMessage(wss.clients, 'connection_established', '{}');
            } else {
                weblog.error('Ignoring new WebSocket upgrade. We are already online');
            }
            wss.emit('connection', ws, req);
        });
  });
}

function sendPing (clients){
    clients.forEach(function each(wsClient) {
        wsClient.ping('', {}, true);
    });
}

function sendMessage (clients, event, data, channel = settings.mac) {
    clients.forEach(function each(wsClient) {
        wslog.pending(`Sending new message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
        wslog.debug(JSON.stringify({"event":event, "data": "\""+data+"\"", "channel": channel}));
        wsClient.send(JSON.stringify({"event":event, "data": "\""+data+"\"", "channel": channel}));
    });
}

function sendLongMessage (clients, event, data, channel = ''){
    clients.forEach(function each(wsClient) {
  	const buffer = Buffer.alloc(134);
  	buffer.writeUInt16LE(parseInt(settings.valveId,16));
  	buffer.writeUInt16LE(data, 4);
        wslog.pending(`Sending long message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
  	wslog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g,"$1:").replace(/:$/, '')}`);
        wsClient.send(JSON.stringify({"event":event, "data": buffer.toString('base64'), "channel": channel}));
    });
}

function constructEvent (typ, cmd, channel, min) {
  if (channel < 1 || channel >8) {
        weblog.error('Channel must be between 1 and 8')
	return;
  }
  const ev = {
          event: typ,
	  channel: settings.mac,
  }
  const buffer = Buffer.alloc(18);
  console.log(min + timeStamp);
  buffer.writeUInt16LE(min + timeStamp, 2 * channel);
  buffer.writeUInt16LE(parseInt(settings.valveId,16));
  ev.data = `\"${buffer.toString('base64')}\"`;
  console.log(JSON.stringify(ev));
  weblog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g,"$1:").replace(/:$/, '')}`);
  return ev;
}

