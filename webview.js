const querystring = require('querystring');
const fs = require('fs');

const handleWeb = function(req, res, log)
{
    const opts = querystring.parse(req.url.replace(/.*REST./, '').replace(/\?/, '&'));
    const path = Object.keys(opts)[0].replace(/WEB/, '').replace(/,/g, '');
    log.debug('WEB API call with opts', JSON.stringify(opts));
    let file = './web/index.html';
    if (req.url === '/') {
        return res.end('<html><body><script>location.href="/WEB";</script></body></html>');
    }
    if (req.url === '/WEB/bootstrap.min.css' ) {
        file = './web/bootstrap.min.css';
    }
    return fs.readFile(file, (err, data) => {
	if(err) {
            log.error(err.message);
    	    return res.end(err.message);
        }
        return res.end(data);
    })
}

exports.handleWeb = handleWeb;
