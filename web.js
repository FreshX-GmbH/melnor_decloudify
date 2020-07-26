'use strict';

// TODO :
// - online state flag?
// - use a subscriber array
// - throw out old stuff
// - encapsulate a client (defined by channel,port) connection into an object

/* eslint no-use-before-define: "off" */

const http = require('http');
const WebSocket = require('ws');
const querystring = require('querystring');
const webview = require('./webview');

const { QLog } = require('quanto-commons');

const weblog = QLog.scope('WEB');
const wslog = QLog.scope('WS');
const restlog = QLog.scope('REST');

const binFields = {
   DAY: 6,
   TIME_LOW: 8,
   TIME_HIGH: 9,
   BUTTONS: 12,
   BATTERY: 13,
   STATE: 14
}
const states = { 
   0: 'online',
   1: 'just offline',
   2: 'offline for more than 5 minutes'
}

const wss = new WebSocket.Server({ noServer: true });

const settings = require('./settings.json');

const channels = [];
const channel = settings.mac.toLowerCase();

let timeStamp = 0;
let remoteStamp = 0;
let wsConnected = false;
let online = false;
let state = 0;
let SM = 0;
let iv;
const valves = [0, 0, 0, 0, 0, 0, 0, 0];
const reportedValves = [0, 0, 0, 0, 0, 0, 0, 0];
let battery = "?";
let batteryPercent = "?";
let connectionState = 2;

function dumpLog(id, binState, msg){
    msg += ' :';
    let devmsg=`DevID ${id} :`;
    if (devmsg.length < msg.length) {
       devmsg.padEnd(msg.length);
    } else {
       msg.padEnd(devmsg.length);
    }
    weblog.complete(`${msg.padEnd(devmsg.length)} MAC2 MAC1 MAC0 DAY? TIME VALV B/BA ST?? [HUM SENSOR ?]`);
    weblog.complete(`${devmsg.padEnd(msg.length)} ${binState.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
}

function updateStates(binState){
    remoteStamp = binState[binFields.TIME_LOW] + (binState[binFields.TIME_HIGH] * 256);
    timeStamp = remoteStamp;
    battery = binState[binFields.BATTERY];
    batteryPercent = battery * 1.4428-268;
    connectionState = binState[binFields.STATE];
    let buttons = binState[binFields.BUTTONS];
    weblog.complete(`Battery is roughly at ${Math.floor(batteryPercent)}%`);
    reportedValves[0] = buttons & 0x1;
    reportedValves[1] = buttons & 0x2;
    reportedValves[2] = buttons & 0x4;
    reportedValves[3] = buttons & 0x8;
    reportedValves[4] = buttons & 0x11;
    reportedValves[5] = buttons & 0x22;
    reportedValves[6] = buttons & 0x44;
    reportedValves[7] = buttons & 0x88;
    weblog.complete(`BUTTONS: ${reportedValves}`);
}

const server = http.createServer((req, res) => {
    weblog.debug('New request : ', req.url);
    // Our REST server
    if (req.url.startsWith('/app/')) {
        const opts = querystring.parse(req.url.replace(/.*app./, '').replace(/\?/, '&'));
        restlog.debug('New Pusher client connected with opts', JSON.stringify(opts));
        // /app/3fc4c501186e141227fb?client=melnor&version=1.0&protocol=6

        return res.end('OK');
    }
    if (req.url === ('/') || req.url.startsWith('/WEB')) {
	return webview.handleWeb(req, res, weblog);
    }
    if (req.url.startsWith('/REST')) {
        const opts = querystring.parse(req.url.replace(/.*REST./, '').replace(/\?/, '&'));
        restlog.debug('Rest API call with opts', JSON.stringify(opts));
        if (!opts.channel) {
            let dbg = '';
            // eslint-disable-next-line guard-for-in
            for (let i = 0; i < valves.length; i++) {
                dbg += ` "V${i}": "${valves[i]}",`;
            }
            for (let i = 0; i < reportedValves.length; i++) {
                dbg += ` "R${i}": "${reportedValves[i]}",`;
            }
            dbg += `"systime": "${timeStamp}"`;
            dbg.replace(/,,,/, '');
            let gen = ` "online": "${states[connectionState]}",`;
            gen += ` "battery": "${batteryPercent}"`;

            return res.end(`{ "status": "OK", ${gen}, "valves": { ${dbg} }}`);
        }
        const valve = parseInt(opts.channel, 10);
        if (opts.min && opts.min > 0 && valve > 0) {
            restlog.pending(`SET CH ${valve} to ${opts.min} minutes.`);
            valves[valve-1] = parseInt(opts.min, 10) + timeStamp;
            wslog.pending(`Turning ON channel ${valve} for runtime ${opts.min}`);
            if (online) {
                const r = msgManualSched(opts.channel, valves[valve]);
                if (r !== true) {
                    return res.end(`{"status" : "err", "msg": "${r}"`);
                }

                return res.end('{ "status": "OK", "msg": "value updated"}');
            }
        } else {
            restlog.pending(`SET CH ${valve} to OFF.`);
            wslog.pending(`Sending an OFF message for valve ${valve}`);
            valves[valve-1] = 0;
            if (online) {
                const r = msgManualSched(opts.channel, valves[valve]);
                if (r !== true) {
                    return res.end(`{"status" : "err", "msg": "${r}"`);
                }
            }
        }

        return res.end('{ "status": "OK", "msg": "value set to 0." }');
    } else if (req.url.startsWith('/submit')) {
        // Melnor Submit route
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

        // remoteId = channel (00000000, actual macID oder ffffffffff)
        const remoteId = `${binState[5].toString(16).padStart(2,'0')}${binState[4].toString(16).padStart(2,'0')}${binState[3].toString(16).padStart(2,'0')}` +
            `${binState[2].toString(16).padStart(2,'0')}${binState[1].toString(16).padStart(2,'0')}${binState[0].toString(16).padStart(2,'0')}`;
        // First message from device
        if (id === '0000000000' || id === 'ffffffffff') {
            weblog.complete(`Received submit for channel ${remoteId} ->  ${binState.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
            remoteStamp = binState[8] + (binState[9] * 256);
            timeStamp = remoteStamp;
            // TODO : generate random hash_key?
            msgHashkey('53f574cb08');

            return res.end('OK');
        }

        if (id === '0000000000' || id === 'ffffffffff') {
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
            updateStates(binState);
            if (connectionState === 0) {
                dumpLog(id, binState, 'Device online (ffffffffffff)');
                online = true;
            } else {
                dumpLog(id, binState, 'Device not online');
            }
        } else if (remoteId === settings.mac.toLowerCase()) {
            updateStates(binState);
            if (connectionState === 0) {
                dumpLog(id, binState, 'Device online');
                online = true;
            } else {
                dumpLog(id, binState, 'Device not online');
            }
        } else if (remoteId === '000000000000') {
            // we got no state buffer from request (usually an --ack
            return res.end('OK');
        } else {
            online = true;
            dumpLog(id, binState, `Device in unknown state ${remoteId}`);
        }
    } else {
        weblog.complete('Ignoring request', req.url);
    }

    return res.end('OK');
});

wss.on('connection', (ws) => {
    const { port } = ws._socket._peername;
    wsConnected = true;
    wslog.debug(`New WS connection established from port id ${port}`);
    ws.on('pong', (mess) => {
        wslog.pending(`received a pong : ${mess}`);
    });
    ws.on('ping', (mess) => {
        wslog.pending(`received a ping : ${mess}`);
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        wslog.debug(`New WS event ${msg.event} for port id ${port}`);
        switch (msg.event) {
            case 'pusher:ping':
                wslog.pending('Received pusher ping on client', msg);
                sendMessage(wss.clients, 'pusher:pong', '{}', settings.mac);
                // ssendMessage(ws, 'pusher:pong', '{}', settings.mac);
                break;
            case 'pusher:subscribe':
                wslog.pending(`Received subscribe request for channel ${msg.data.channel} with extra data ${msg.data.channel_data}`);
                // TODO : push all subscribers into an array and deliver to all of them
                channels[msg.data.channel] = ws;
                sendMessage(wss.clients, 'pusher_internal:subscription_succeeded', '{}', settings.mac);
                // sendMessage(ws, 'pusher_internal:subscription_succeeded', '{}', settings.mac);
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
    timeStamp += 1;
    weblog.debug(`Watchdog : time:${timeStamp}/${remoteStamp}`);
    for (let i = 0; i < valves.length; i++) {
    // for(i in valves) {
        const t = parseInt(valves[i], 10);
        if (t > timeStamp) {
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
        weblog.success(`WebSocket upgrade request from ${socket.remoteAddress.replace(/.*:/, '')}`);
        if (req.headers.upgrade !== 'WebSocket' && req.headers.upgrade !== 'websocket') {
            console.log('Bad request:', req.headers);
            socket.end('HTTP/1.1 400 Bad Request');

            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            // const { port } = ws._socket._peername;
            msgConnectionEstablished();
            wss.emit('connection', ws, req);
        });
    });
};

// eslint-disable-next-line no-unused-vars
function sendPing(clients) {
    if (channels[channel]) {
        wslog.pending(`Sending ping response only to channel ${channel}`);
        channels[channel].ping(() => {
            wslog.complete('Sent ping response.');
        });
    } else {
        clients.forEach((wsClient) => {
            wsClient.ping(() => {
                wslog.complete('Sent ping response.');
            });
        });
    }
}

function sendRawMessage(clients, msg) {
    if (channels[channel.toLowerCase()]) {
        wslog.pending(`Sending RAW message : ${msg} only to channel ${channel}`);
        channels[channel].send(msg);
    } else {
        clients.forEach((wsClient) => {
            wslog.pending(`Sending RAW message : ${msg}, ${wsClient}`);
            wsClient.send(msg);
        });
    }
}

function sendMessage(clients, event, data, _channel = settings.mac.toLowerCase()) {
    if (channels[_channel]) {
        const wsClient = channels[_channel];
        const { port } = wsClient._socket._peername;
        wslog.pending(`Sending new message : ${event} only to ${wsClient._socket.remoteAddress.replace(/.*:/, '')} port ${port}`);
        wslog.debug(JSON.stringify({ event, data: `${data}`, channel: channel.toLowerCase() }));
        channels[channel].send(JSON.stringify({ event, data: `${data}`, channel: channel.toLowerCase() }));
    } else {
        clients.forEach((wsClient) => {
            const { port } = wsClient._socket._peername;
            wslog.pending(`Sending new message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')} port ${port}`);
            wslog.debug(JSON.stringify({ event, data: `${data}`, channel: channel.toLowerCase() }));
            wsClient.send(JSON.stringify({ event, data: `${data}`, channel: channel.toLowerCase() }));
        });
    }
}

function sendLongMessage(clients, event, data, _channel = settings.mac.toLowerCase()) {
    const buffer = Buffer.alloc(134);
    buffer.writeUInt16LE(parseInt(settings.valveId, 16));
    buffer.writeUInt16LE(data, 4);
    if (channels[_channel]) {
        const wsClient = channels[_channel];
        // const { port } = wsClient._socket._peername;
        wslog.pending(`Sending long message : ${event} only to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
        wslog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
        channels[channel].send(JSON.stringify({ event, data: buffer.toString('base64'), channel: channel.toLowerCase() }));
    } else {
        clients.forEach((wsClient) => {
            wslog.pending(`Sending long message : ${event} to ${wsClient._socket.remoteAddress.replace(/.*:/, '')}`);
            wslog.complete(`Sent buffer ${buffer.toString('hex').replace(/(.{4})/g, '$1:').replace(/:$/, '')}`);
            wsClient.send(JSON.stringify({ event, data: buffer.toString('base64'), channel: channel.toLowerCase() }));
        });
    }
}

// Sent out the current valve state as manual scheduling request
function msgManualSched() {
    weblog.complete(`Updating valve state ${valves}`);
    let dbg = '';

    const ev = {
        event: 'manual_sched',
    };

    const buffer = Buffer.alloc(18);

    buffer.writeUInt16LE(parseInt(settings.valveId, 16));

    for (let i = 0; i < valves.length; i++) {
        const t = parseInt(valves[i], 10);
        if (t > timeStamp) {
            dbg += `V${i}:${t - timeStamp} `;
            buffer.writeUInt16LE(parseInt(t, 10), 2 + 2 * i);
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

    sendRawMessage(wss.clients, JSON.stringify(ev));
    // return ev;
}

function msgSchedDay(day) {
    const m = `sched_day${day}`;
    sendLongMessage(wss.clients, m, 0);
}

function msgTimestamp(time) {
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
    sendMessage(wss.clients, 'pusher:connection_established', '{\"socket_id\":\"265216.826472\"}');
}

console.log('Please run node actor.js');
