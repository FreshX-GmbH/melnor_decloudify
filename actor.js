'use strict';

const dns = require('./dnsTools');
const web = require('./web');

const CMD_OFF = 0x000;
const CMD_ON = 0x274;

const settings = require('./settings.json');

// GET /submit/?idhash=53f574cb08&message=ascii--Day0scheduleevnt--ack--null HTTP/1.1

// # cat | sed "s/.*{/{/" | tee /dev/stderr | sed "s/.*data.....//"| sed "s/.....channel.*//"

// All channels OFF
// {"event":"manual_sched","data":"\"IMQAAAAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// IMQAAAAAAAAAAAAAAAAAAAAA
// 0000000 20 c4 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// channel 1 ON
// {"event":"manual_sched","data":"\"IMR0AgAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// IMR0AgAAAAAAAAAAAAAAAAAA
// 0000000 20 c4 74 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// ???
// {"event":"manual_sched","data":"\"IMTpAgYDAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// IMTpAgYDAAAAAAAAAAAAAAAA
// 0000000 20 c4 e9 02 06 03 00 00 00 00 00 00 00 00 00 00 00 00
// {"event":"manual_sched","data":"\"IMQAAO4CAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 00 00 ee 02 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 1 / 10 
// {"event":"manual_sched","data":"\"IMQHAwAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 07 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 1 / 30
// {"event":"manual_sched","data":"\"IMQcAwAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 1c 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 2 / 10
// {"event":"manual_sched","data":"\"IMQAAAwDAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 00 00 0c 03 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 2 / 45
// {"event":"manual_sched","data":"\"IMQAAC8DAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 00 00 2f 03 00 00 00 00 00 00 00 00 00 00 00 00
// ?? channel 2 / 60
// {"event":"manual_sched","data":"\"IMQAAD8DAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 00 00 3f 03 00 00 00 00 00 00 00 00 00 00 00 00
// ?? channel 2 / ON -> 60
// {"event":"manual_sched","data":"\"IMQAAEQDAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 00 00 44 03 00 00 00 00 00 00 00 00 00 00 00 00
// ?? channel 1 / ON -> 60 / channel 2 still ON -> 60
// {"event":"manual_sched","data":"\"IMREA0QDAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 44 03 44 03 00 00 00 00 00 00 00 00 00 00 00 00
// {"event":"manual_sched","data":"\"IMREAwAAAAAAAAAAAAAAAAAA\"","channel":"7cec79f3056e"}
// 0000000 20 c4 44 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00








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

// constructEvent('manual_sched',CMD_OFF);
// constructEvent('manual_sched',CMD_ON);

dns.start();
web.start();

