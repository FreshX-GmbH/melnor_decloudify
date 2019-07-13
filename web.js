'use strict';

const fs = require('fs');
const http = require('http');
const staticFiles = require('node-static');
const file = new staticFiles.Server('./www');
const crypto = require('crypto');

const settings = require('./settings.json');

let wsConnected = false;

// {"event":"manual_sched","data":"\"IMQAAAAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// {"event":"manual_sched","data":"\"IMR0AgAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// base64 -D | hexdump
// IMQAAAAAAAAAAAAAAAAAAAAA
// 0000000 20 c4 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// 0000010 00 00
// IMR0AgAAAAAAAAAAAAAAAAAA
// 0000000 20 c4 74 02 00 00 00 00 00 00 00 00 00 00 00 00
// 0000010 00 00

function generateAcceptValue (acceptKey) {
  return crypto
  .createHash('sha1')
  .update(acceptKey + '258EAFA5-E914–47DA-95CA-C5AB0DC85B11', 'binary')
  .digest('base64');
}

const webServer = http.createServer((req, res) => {
  console.log('New request : ', req.url);
  if (req.url.startsWith("/REST")) {
	  console.log('call to rest api:', req.url);
	  return res.end('OK');
  }
  req.addListener('end', () => file.serve(req, res)).resume();
});

exports.start = function () {
  webServer.listen(settings.port, () => {
    console.log(`Web server running at http://0.0.0.0:${settings.port}`);
  });

  webServer.on('upgrade', (req, socket) => {
    console.log('WebSocket upgrade request on req', req.url);
    // if (req.headers['upgrade'] !== 'websocket' || req.headers['upgrade'] !== 'WebSocket') {
    if (req.headers['upgrade'] !== 'WebSocket') {
	console.log('Bad request:', req.headers);
        socket.end('HTTP/1.1 400 Bad Request');
        return;
    }
    wsConnected = socket;
    socket.on('data', buffer => {
      const message = parseMessage(buffer);
      if (message) {
          // For our convenience, so we can see what the client sent
          console.log(message);
          // We'll just send a hardcoded message in this example
          socket.write(constructReply({ message: {event:'manual_sched',data:"\"Lc0AAAAAAAAAAAAAAAAAAAAA\"",channel:mac} }));
      } else if (message === null) {
          console.log('WebSocket connection closed by the client.');
      }
    });
    socket.write(constructReply(constructEvent('manual_sched',CMD_ON)));
  });
}

function constructEvent (typ, cmd) {
  const ev = {
      message: {
          event: typ,
	  channel: settings.mac,
    }
  }

  const buffer = Buffer.alloc(18);
  const id = Buffer.alloc(2);
  buffer.writeUInt16LE(parseInt(settings.valveId,16));
  buffer.writeUInt16LE(ev, 2);
  ev.message.data = `\"${buffer.toString('base64')}\"`;
  console.log(ev);
  return ev;
}

function constructReply (data) {
  const json = JSON.stringify(data);
  console.log('Construct reply : ', data);
  const jsonByteLength = Buffer.byteLength(json);
  // Note: we're not supporting > 65535 byte payloads at this stage
  const lengthByteCount = jsonByteLength < 126 ? 0 : 2;
  const payloadLength = lengthByteCount === 0 ? jsonByteLength : 126;
  const buffer = Buffer.alloc(2 + lengthByteCount + jsonByteLength); 
  // Write out the first byte, using opcode `1` to indicate that the message 
  // payload contains text data 
  buffer.writeUInt8(0b10000001, 0); 
  buffer.writeUInt8(payloadLength, 1);
  // Write the length of the JSON payload to the second byte 
  let payloadOffset = 2; 
  if (lengthByteCount > 0) { 
	  buffer.writeUInt16BE(jsonByteLength, 2); 
	  payloadOffset += lengthByteCount; 
  } 
  // Write the JSON data to the data buffer 
  buffer.write(json, payloadOffset); 
  return buffer;
}

function parseMessage (buffer) {
  const firstByte = buffer.readUInt8(0);
  const isFinalFrame = Boolean((firstByte >>> 7) & 0x1);
  const [reserved1, reserved2, reserved3] = [ Boolean((firstByte >>> 6) & 0x1), Boolean((firstByte >>> 5) & 0x1), Boolean((firstByte >>> 4) & 0x1) ];
  const opCode = firstByte & 0xF;
  // We can return null to signify that this is a connection termination frame
  if (opCode === 0x8)
     return null;
  // We only care about text frames from this point onward
  if (opCode !== 0x1)
    return;
  const secondByte = buffer.readUInt8(1);
  const isMasked = Boolean((secondByte >>> 7) & 0x1);
  // Keep track of our current position as we advance through the buffer
  let currentOffset = 2; 
  let payloadLength = secondByte & 0x7F;
  if (payloadLength > 125) {
    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
    } else {
      // 127
      // If this has a value, the frame size is ridiculously huge!
      const leftPart = buffer.readUInt32BE(currentOffset);
      const rightPart = buffer.readUInt32BE(currentOffset += 4);
      // Honestly, if the frame length requires 64 bits, you're probably doing it wrong.
      // In Node.js you'll require the BigInt type, or a special library to handle this. 
      throw new Error('Large payloads not currently implemented');
    }
  }
}

