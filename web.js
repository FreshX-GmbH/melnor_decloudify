'use strict';

/* eslint no-use-before-define: "off" */

const http = require('http');
const WebSocket = require('ws');
const querystring = require('querystring');

const { QLog } = require('quanto-commons');

const weblog = QLog.scope('WEB');
const wslog = QLog.scope('WS');
const restlog = QLog.scope('REST');

const wss = new WebSocket.Server({ noServer: true });

const settings = require('./settings.json');

let timeStamp = 0;
let remoteStamp = 0;
let wsConnected = false;
let online = false;
let state = 0;
let SM = 0;
let iv;
let valves = [ 0, 0, 0, 0, 0, 0, 0, 0 ];
let valveTimes = [ 0, 0, 0, 0, 0, 0, 0 ];

const server = http.createServer((req, res) => {
    weblog.debug('New request : ', req.url);
    // Our REST server
    if (req.url.startsWith('/REST')) {
        const opts = querystring.parse(req.url.replace(/.*REST./, '').replace(/\?/, '&'));
        restlog.debug('Rest API call with opts', JSON.stringify(opts));
	if(!opts.channel) {

    	    let dbg = '';
            let i = 0;
    	    for(i in valves) {
                dbg += ` "V${i}": "${valves[i]}",`;
    	    }
	    dbg += ` "systime": "${timeStamp}"`;
	    dbg.replace(/,,,/, '');
            return res.end(`{ "status": "OK", "valves": { ${dbg} }}`);
	}
        let ch = parseInt(opts.channel,10);
        if (opts.min && opts.min > 0) {
            restlog.pending(`SET CH ${opts.channel} to ${opts.min} minutes.`);
	    valves[ch] = parseInt(opts.min, 10) + timeStamp;
            wslog.pending('Turning ON channel', opts.channel, ' for runtime', opts.min);
	    if(online) {
                const r = msgManualSched(opts.channel, valves[ch]);
                if (r !== true) {
                    return res.end(`{"status" : "err", "msg": "${r}"`);
                }
        	return res.end('{ "status": "OK", "msg": "value updated"}');
            }
        } else {
            restlog.pending(`SET CH ${opts.channel} to.`);
            wslog.pending('Sending an OFF message for channel', opts.channel);
	    valves[ch];
	    if(online) {
                const r = msgManualSched(opts.channel, 0);
                if (r !== true) {
                    return res.end(`{"status" : "err", "msg": "${r}"`);
                }
            }
        }

       	return res.end('{ "status": "OK", "msg": "value set to 0." }');
    }
    // Melnor Submit route
    else if (req.url.startsWith('/submit')) {
        const id = req.url.replace(/.*idhash=/, '').replace(/.message.*/, '').replace(/'/g, '');
        state = req.url.replace(/.*message=/, '');
        let binState;

        if (state.endsWith('ack--null')) {
            const ackType = state.replace(/ascii--/, '').replace(/--ack--null/, '');
            weblog.success(`Device sent event ack for ${ackType} device time : ${remoteStamp}.`);
            binState = Buffer.alloc(18);
        } else {
            binState = Buffer.from(state, 'base64');
        }

        const remoteId = `${binState[5].toString(16)}${binState[4].toString(16)}${binState[3].toString(16)}` +
            `${binState[2].toString(16)}${binState[1].toString(16)}${binState[0].toString(16)}`;
        // First message from device
        if (id === '0000000000') {
            weblog.complete(`Received initial state ${remoteId} ->  ${binState.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
            remoteStamp = binState[8] + (binState[9] * 256);
            timeStamp = remoteStamp;
            // TODO : generate random hash_key?
            msgHashkey('53f574cb08');

            return res.end('OK');
        }


        if (wsConnected === false) {
            wslog.error('Device not in sync. Please reset or wait.');

            return res.end('OK');
        }
        // send day schedule 0-6
        if (SM < 7) {
            msgSchedDay(SM);
            SM += 1;

            return res.end('OK');
        }
        if (SM === 7) {
            msgManualSched(2, 20);
            SM += 1;

            return res.end('OK');
        }
        if (SM === 8) {
            // Send TimeStamp & extra connection est byte?
            msgTimestamp(timeStamp, 0x03);
            SM += 1;

            return res.end('OK');
        }
        if (SM === 9) {
            msgRevReq();
            SM += 1;

            return res.end('OK');
        }
        if (SM === 10) {
            if (iv) {
                clearInterval(iv);
            }
            iv = setInterval(checkTimeout, 60000);
            SM += 1;
        }
        if (state.startsWith('ascii--revisions--E400')) {
            weblog.debug('Device sent revisions-E400.');

            return res.end('OK');
        }
        if (remoteId === 'ffffffffffff') {
            weblog.complete('Device online with errors, state : MAC2 MAC1 MAC0 STAT TIME VALV CHNL ???? ???? ???? STAT2');
            weblog.complete(`DevID ${id}                   ${binState.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
            remoteStamp = binState[8] + (binState[9] * 256);
            online = true;
        } else if (remoteId === settings.mac.toLowerCase()) {
            weblog.complete('Device online, state : MAC2 MAC1 MAC0 STAT TIME VALV CHNL ???? ???? ???? STAT2');
            weblog.complete(`DevID ${id}       ${binState.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
            remoteStamp = binState[8] + (binState[9] * 256);
            online = true;
        } else if (remoteId === '000000000000') {
            // we got no state buffer from request (usually an --ack
            return res.end('OK');
        } else {
            online = true;
            weblog.complete('Device unknown state : MAC2 MAC1 MAC0 STAT TIME VALV CHNL ???? ???? ???? STAT2');
            weblog.complete(`DevID ${id}       ${binState.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
        }
    } else {
        weblog.complete('Ignoring request', req.url);
    }

    return res.end('OK');
});

wss.on('connection', (ws) => {
    wsConnected = true;
    wslog.debug('New WS connection established');
    ws.on('pong', (mess) => {
        wslog.pending(`received a pong : ${mess}`);
    });
    ws.on('ping', (mess) => {
        wslog.pending(`received a ping : ${mess}`);
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        wslog.debug('New WS event', msg.event);
        switch (msg.event) {
            case 'pusher:subscribe':
                wslog.pending('Received subscribe request.');
                sendMessage(wss.clients, 'pusher_internal:subscription_succeeded', '{}', settings.mac);
                online = false;
                SM = 0;
                break;
            default:
                wslog.error('I dont know how to handle this event.');
                break;
        }
    });
});


function checkTimeout() {
    let dbg = '';
    let i = 0;
    timeStamp += 1;
    weblog.debug(`Watchdog : time:${timeStamp}/${remoteStamp}`);
    for(i in valves) {
	let t = parseInt(valves[i]);
	if(t > timeStamp) {
            dbg += `V${i}:${t - timeStamp} `;
	} else {
            dbg += `V${i}:OFF `;
	    valves[i] = 0;
        }
    }
    weblog.debug(`VALVES : ${dbg}`);
    sendPing(wss.clients);
    // msgTimestamp(timeStamp);
}

exports.start = function () {
    server.listen(settings.port, () => {
        weblog.success(`listening on 0.0.0.0 port ${settings.port}`);
    });

    server.on('upgrade', (req, socket, head) => {
        weblog.success('WebSocket upgrade request from', socket.remoteAddress.replace(/.*:/, ''));
        if (req.headers.upgrade !== 'WebSocket') {
            console.log('Bad request:', req.headers);
            socket.end('HTTP/1.1 400 Bad Request');

            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            msgConnectionEstablished();
            wss.emit('connection', ws, req);
        });
    });
};

// eslint-disable-next-line no-unused-vars
function sendPing(clients) {
    clients.forEach((wsClient) => {
        wsClient.ping('', {}, true);
    });
}

function sendRawMessage(clients, msg) {
    clients.forEach((wsClient) => {
        wslog.pending(`Sending RAW message : ${msg}`);
        wsClient.send(msg);
    });
}

function sendMessage(clients, event, data, channel = settings.mac) {
    clients.forEach((wsClient) => {
        wslog.pending(`Sending new message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
        wslog.debug(JSON.stringify({ event, data: `\"${data}\"`, channel: channel.toLowerCase() }));
        wsClient.send(JSON.stringify({ event, data: `\"${data}\"`, channel: channel.toLowerCase() }));
    });
}

function sendLongMessage(clients, event, data, channel = settings.mac) {
    clients.forEach((wsClient) => {
        const buffer = Buffer.alloc(134);
        buffer.writeUInt16LE(parseInt(settings.valveId, 16));
        buffer.writeUInt16LE(data, 4);
        wslog.pending(`Sending long message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
        wslog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
        wsClient.send(JSON.stringify({ event, data: buffer.toString('base64'), channel: channel.toLowerCase() }));
    });
}

function constructEvent(typ, channel, min) {
    let dbg = '';
    let i = 0;

    const ev = {
        event: typ,
    };

    const buffer = Buffer.alloc(18);

    buffer.writeUInt16LE(parseInt(settings.valveId, 16));

    for(i in valves) {
	let t = parseInt(valves[i]);
	if(t > timeStamp) {
            dbg += `V${i}:${t - timeStamp} `;
            buffer.writeUInt16LE(parseInt(t), 2 * i);
	} else {
            dbg += `V${i}:OFF `;
	    valves[i] = 0;
        }
    }
    wslog.debug(`VALVES : ${dbg}`);
    ev.data = `\"${buffer.toString('base64')}\"`;
    ev.channel = settings.mac.toLowerCase();
    wslog.debug(`Constructed msg : ${JSON.stringify(ev)}`);
    weblog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);

    return ev;
}

function msgSchedDay(day) {
    const m = `sched_day${day}`;
    sendLongMessage(wss.clients, m, 0);
}

function msgManualSched(channel, time) {
    weblog.complete(`Updating valve state ${valves}`);
    const ev = constructEvent('manual_sched');
    sendRawMessage(wss.clients, JSON.stringify(ev));

    return true;
}

function msgTimestamp(time, extra = 0) {
    const b = Buffer.alloc(3);
    b.writeUInt16LE(parseInt(time, 10));
    b.writeInt8(0, 2);
    weblog.complete(`Sent buffer ${b.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
    sendMessage(wss.clients, 'timestamp', b.toString('base64'), settings.mac);
}

function msgHashkey(key) {
    sendMessage(wss.clients, 'hash_key', `\"${key}\"`, settings.mac);
}

function msgRevReq() {
    sendMessage(wss.clients, 'rev_request', '');
}

function msgConnectionEstablished() {
    sendMessage(wss.clients, 'pusher:connection_established', '{\'socket_id\':\'265216.826472\'}');
}
