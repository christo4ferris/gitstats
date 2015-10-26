/*eslint-env node */
'use strict';

var https = require('https');

class  Throttler {
  constructor(config) {
		var i = 2000;
		this.interval = 2000;
		if (config && config.interval) i = config.interval;
		this.setIntervalLength(i);	
		this.timer = null;
		this.stack = [];
	}

  process() {
		var item = this.stack.shift();
		//console.log('process: ' + item.opts.path);
		https.request(item.opts, item.func).end();
		if (this.stack.length === 0) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	getIntervalLength() {
		return this.interval;
	}

	setIntervalLength(interval) {
		if (isNaN(interval)) {
			throw new Error('setIntervalLength: invalid argument: must be an integer')
		}
		this.interval = parseInt(interval, 10);
	}

	throttle(item) {
		this.stack.push(item);
		if (this.timer === null) {
			this.timer = setInterval(this.process, this.interval);
		}
	}
}

module.exports = Throttler;
