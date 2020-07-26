'use strict';

const dns = require('./dnsTools');
const web = require('./web');
const { QLog } = require('quanto-commons');

// # simple shell one-liner to decode the payload of a wireshark WS frame
// cat | sed "s/.*{/{/" | tee /dev/stderr | sed "s/.*data.....//"| sed "s/.....channel.*//"
// # simple one liner to decode message=<base64> payload
// cat | sed "s/.*message=//" | base64 -D | hexdump

// Missing parts were taken from the sunshower project, thanks!

// MAC2 MAC1 MAC0 DAY? TIME VALV B/BA ST?? [HUM SESNOR ?]
// 6e05 f379 ec7c 0200 1103 0000 0000 0000 0000 0000 0000
// ======================================================
// TIME : Time since start of day
// DAY  : 0 - sunday, 6 - saturday (first byte only)
// MAC  : MAC ID of the Bridge
// VALV : ID of the valve (under the valve)
// B    : Buttons binary mask : (0x1 button 1, 0x2 button 2, 0x4 button 3, 0x8 button 4) (0x11 web valve 1, 0x22 web valve 2, 0x44 web valve 3, 0x88 valve 4)
// BA   : Battery state : 255 = 100%, ...
// ST   : State : 0 - connected, 1 not connected, 2 not connected for 5mn+
// HUM  : Humidty Sensor data (i dont have one)

// manual_sched events sent to the device to turn on / off valves
// e2dc 0000 0000 0000 0000 0000 0000 0000 0000
// =============================================================
// VaId -V1- -V2- -V3- -V4- [-Multiple valve?-]

const log = QLog.scope('MAIN');
log.info('Melnor Aqua Timer Decloudifier starting...');

dns.start();
web.start();
