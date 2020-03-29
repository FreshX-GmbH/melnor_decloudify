
# Intro

This replaces the wifiaquatimer.com cloud interface of the Melnor 4 channel Aqua Timer Smart (also known as Natrain)

This is done by DNS Spoofing the cloud entries and providing a compatible interface to the Smart Device.

Our code provides a simple rest API and CLI which allows you to run the Water Timer completely on premise without internet or cloud connection. (We basically simulate a very basic pusherapp API server)

*Please note* : we acquired this device because it is notorically insecure (only running http and WS) so it was clear we could easily reverse engineer it an run it local only. We advise you not to use the device with the RainCloud (it is very outdated from look and feel, completing our picture), its insecure and easily hackable, the vendor did not put too much effort into the end-user security and safety.

*Please note further* : the basic device (without the cloud functionality) seems pretty nice to us though. Just the network and cloud implementation was done without any love or care.

Have fun ...

# Warning

This is code under development and not yet 100% functional. As of 04/2020 you can control all channels via the REST api but it is not tested enough yet.

# The settings

You need to provide a valid settings.json, see settings.json.template for an example.
All fields are mandatory

```
{
	"enabled": true, // set to false and the dns spoofing will forward everyhing
	"port": 80,      // your cloud and WS port (must be port 80 actually, unless you proxy this)
	"mac": "<MAC address of you rf device case sensitive and without :>", // find it on the device
	"myIP": "<ip of the computer running this code>",// needed for the DNS spoofing
	"valveId": "<four code valve id>",  		 // find it on the sticker of your valve
	"dnsForwarder": "8.8.8.8", 			 // which upstream DNS to use
	"loglevel": "debug"				 // what loglevel to run in (set to info in production)
}
```

# The REST API

Turn channel 2 on 60 minutes : `http://<IP of your decloudifier>/REST?channel=2&min=60

Turn channel 2 off (this does not work yet, so set the valve to the minimum of 1)

http://<IP of your decloudifier>/REST?channel=2&min=1

channel = 0,1,2,3
min = 0 - ??? (600?)

Get current valve state (as our service is seeing it, not yet checked with the device status itself

http://<IP of your decloudifier>/REST

# How it works

Find out the Melnor device IP in your LAN and connect to its web interface via HTTP, set the DNS Server and the Gateway of the Melnor to your system running this code (i.e. a raspberry pi). To start the code simpy run

```node actor.js```

< ... full function to be described ... >

# The handshake

* Step  1: DEV DNS lookup ws.pusherapp.com (PA_Cloud)
* Step  2: DEV -> PA_Cloud : HTTP GET /app/...
* Step  3: PA_Cloud -> DEV : HTTP Upgrade to WS
* Step  4: PA_Cloud -> DEV : WS : event 'connection_established'
* Step  5: DEV -> PA_Cloud : WS : subscribe(channel)
* Step  6: PA_Cloud -> DEV : WS : subscription_succeeded
* Step  7: DEV DNS lookup wifiaquatimer.com (AT_Cloud)
* Step  8: DEV -> AT_Cloud : HTTP GET /submit/?idhash=xxxx&message=<base64>
* Step  9: AT_Cloud -> DEV : 200 OK
* Assumably AT_Cloud <-> PA_Cloud
* Step 10: PA_Cloud -> DEV : WS : event 'hash_key'
* Step 11: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=hashkeyevnt-ack
* Step 12: AT_Cloud -> DEV : 200 OK
* Step 13: DEV DNS lookup wifiaquatimer.com
* Assumably AT_Cloud <-> PA_Cloud
* Step 14: PA_Cloud -> DEV : WS : sched_day0-6
* Step 15: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=<last-command-ack>
* Step 16: AT_Cloud -> DEV : 200 OK
* Loop until all days are sent
* Step 17: PA_Cloud -> DEV : WS : manual_sched, data=<ALL OFF>
* Step 18: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=<last-command-ack>
* Step 19: AT_Cloud -> DEV : 200 OK
* Step 20: PA_Cloud -> DEV : WS : event timestamp, data=<4 byte Base64>
* Step 21: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=<last-command-ack>
* Step 22: AT_Cloud -> DEV : 200 OK
* Step 23: PA_Cloud -> DEV : WS : event rev_request, data=''
* Step 24: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=<last-command-ack>
* Step 25: AT_Cloud -> DEV : 200 OK
* From here we are in a constant loop between
* Step n+1: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=<base64>
* Step n+2: AT_Cloud -> DEV : 200 OK
* Step n+3: PA_Cloud -> DEV : WS Ping
* Step n+4: DEV -> PA_Cloud : WS Pong
* Step n+5: PA_Cloud -> DEV : WS : event timestamp, data=<4 byte Base64>
* Step n+6: DEV -> AT_Cloud : HTTP GET /submit/?idhash=<new_key>&message=<last-command-ack>
* Step n+7: AT_Cloud -> DEV : 200 OK

# References

Thanks goes to

For the basic idea and to get startet

https://hackaday.io/project/160193-raincloud-de-cloudifier

For the DNS Spoofing and proxying

https://peteris.rocks/blog/dns-proxy-server-in-node-js-with-ui/
