/*eslint-env node */
var https = require('https');

function Throttler(config) {
  this.timer = config.timer || 2000;	
	this.stack = [];
}

Throttler.prototype.process = function () {
	var item = this.stack.shift();
	//console.log('process: ' + item.opts.path);
	https.request(item.opts, item.func).end();
	if (this.stack.length === 0) {
		clearInterval(this.timer);
		this.timer = null;
	}
}

Throttler.prototype.throttle = function(item) {
	this.stack.push(item);
	if (this.timer === null) {
		this.timer = setInterval(this.process, this.timer);
	}
}

module.exports = function(config) {
	return new Throttler(config);
};
