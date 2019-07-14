'use strict';

const dns = require('./dnsTools');
const web = require('./web');

// # cat | sed "s/.*{/{/" | tee /dev/stderr | sed "s/.*data.....//"| sed "s/.....channel.*//"

// is that the ok?
// GET /submit/?idhash=0000000000&message=bgXzeex8AAAdAAAAAAAAAAAAAAAAAA== HTTP/1.1
// 0000000 6e 05 f3 79 ec 7c 00 00 1d 00 00 00 00 00 00 00 00 00

// device -> raincloud (http)
// GET /submit/?idhash=53f574cb08&message=ascii--Day0scheduleevnt--ack--null HTTP/1.1
// answer from raincloud to device (WS)
// {"event":"sched_day4","data":"\"IMQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\"","channel":settings.mac}
// 0000000 20 c4 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
// *
// 0000130 00 00 00 00

// GET /submit/?idhash=0000000000&message=bgXzeex8AABWAQAAAAAAAAAAAAAAAA==
// State of the device
// 0000000 6e 05 f3 79 ec 7c 00 00 56 01 00 00 00 00 00 00 00 00

// /submit/?idhash=0000000000&message=ascii--manualctrlevnt--ack--null
// Answer : 
// {"event":"rev_request","data":"\"\"","channel":settings.mac}


// WS upgrade done ? what is the socket id ?
// {"event":"pusher:connection_established","data":"{\"socket_id\":\"265216.826472\"}"}
// {"data": {"channel": settings.mac}, "event": "pusher:subscribe"}
// {"event":"pusher_internal:subscription_succeeded","data":"{}","channel":settings.mac}
// {"event":"hash_key","data":"\"53f574cb08\"","channel":settings.mac}

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

dns.start();
web.start();
