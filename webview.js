const querystring = require('querystring');
const fs = require('fs');

const handleWeb = function(req, res, log)
{
    const opts = querystring.parse(req.url.replace(/.*REST./, '').replace(/\?/, '&'));
    const path = Object.keys(opts)[0];
    log.debug('WEB API call with opts', JSON.stringify(opts));
    return fs.readFile(`./${path}`, (err, data) => {
	if(err) {
	    log.error(err);
    	    return res.end(err.message);

	    return;
        }
    	return res.end(data);
    })
}

exports.handleWeb = handleWeb;
