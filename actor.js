'use strict';

const dns = require('./dnsTools');
const web = require('./web');
const { QLog, undefinedOrNull } = require('quanto-commons');

// simple shell one-liner to decode the payload of a wireshark WS frame 
// cat | sed "s/.*{/{/" | tee /dev/stderr | sed "s/.*data.....//"| sed "s/.....channel.*//"

// ## Status update from DEV
// GET /submit/?idhash=0000000000&message=bgXzeex8AAAdAAAAAAAAAAAAAAAAAA== HTTP/1.1
// Bytes still need to be decoded
// Valid examples (Note CNTR is increasing)
// ???? ???? ???? ???? CNTR DEV0 CH01 ????
// FIX? FIX? FIX? STAT MINS FIX. [ STATES OF CHANNELS   ]
// 6e05 f379 ec7c 0200 1103 0000 0000 0000 0000 0000 0000 -> Device handshake running, no hashkey yet (Time 31s)
// Set timestamp C3 03 03 in Time 41s
// 6e05 f379 ec7c 0300 c303 20c4 00f5 0000 0000 0000 0000 -> Device handshake done, all OFF (Time 51s)
// Turn CH01 on in Time 74s for 30 minutes (20c4 e203 0000 ...) -> until timer reaches e2
// 6e05 f379 ec7c 0300 c303 20c4 11f5 0000 0000 0000 0000 -> Channel 1 on (Time 101s)
// Set timestamp C5 03 03 in Time 101s
// 6e05 f379 ec7c 0300 f803 20c4 00f5 0000 0000 0000 0000 -> Channel 1 off (Time, approx 3060s)
// ???
// 6e05 f379 ec7c 0000 1d00 0000 0000 0000 0000 0000 0000 ->  ??
// Invalid examples
// 0200:0903:0000:0000:0000:0000:0000:0000
// 0200:0a03:0000:0000:0000:0000:0000:0000

// ## ACK from DEV
// GET /submit/?idhash=53f574cb08&message=ascii--Day0scheduleevnt--ack--null HTTP/1.1
// answer from raincloud to device (WS)
// {"event":"sched_day4","data":"\"IMQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\"","channel":settings.mac}

// All channels OFF
// {"event":"manual_sched","data":"\"IMQAAAAAAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// IMQAAAAAAAAAAAAAAAAAAAAA
// 0000000 20 c4 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// channel 1 ON
// {"event":"manual_sched","data":"\"IMR0AgAAAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// IMR0AgAAAAAAAAAAAAAAAAAA
// 0000000 20 c4 74 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// ???
// {"event":"manual_sched","data":"\"IMTpAgYDAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// IMTpAgYDAAAAAAAAAAAAAAAA
// 0000000 20 c4 e9 02 06 03 00 00 00 00 00 00 00 00 00 00 00 00
// {"event":"manual_sched","data":"\"IMQAAO4CAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 00 00 ee 02 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 1 / 10 
// {"event":"manual_sched","data":"\"IMQHAwAAAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 07 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 1 / 30
// {"event":"manual_sched","data":"\"IMQcAwAAAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 1c 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 2 / 10
// {"event":"manual_sched","data":"\"IMQAAAwDAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 00 00 0c 03 00 00 00 00 00 00 00 00 00 00 00 00
// ??? channel 2 / 45
// {"event":"manual_sched","data":"\"IMQAAC8DAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 00 00 2f 03 00 00 00 00 00 00 00 00 00 00 00 00
// ?? channel 2 / 60
// {"event":"manual_sched","data":"\"IMQAAD8DAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 00 00 3f 03 00 00 00 00 00 00 00 00 00 00 00 00
// ?? channel 2 / ON -> 60
// {"event":"manual_sched","data":"\"IMQAAEQDAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 00 00 44 03 00 00 00 00 00 00 00 00 00 00 00 00
// ?? channel 1 / ON -> 60 / channel 2 still ON -> 60
// {"event":"manual_sched","data":"\"IMREA0QDAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 44 03 44 03 00 00 00 00 00 00 00 00 00 00 00 00
// {"event":"manual_sched","data":"\"IMREAwAAAAAAAAAAAAAAAAAA\"","channel":settings.mac}
// 0000000 20 c4 44 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00

const log = QLog.scope('MAIN');
log.info('Melnor Aqua Timer Decloudifier starting...');

dns.start();
web.start();
