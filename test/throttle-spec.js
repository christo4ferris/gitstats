'use strict';

const Throttler = require('../throttle');

var config = {
	'auth': {
	'clientid': 'foobar',
	'secret': 'itsasecret-shhhh'
	},
	'db': {
	'name': 'gitstats-a',
	'url': 'http://localhost:5984/'
	},
	'orgsfile': './orgs.json',
	'collect_pull_requests': false,
	'interval': 1000
};

describe("throttle", function() {
	it('should default', function() {
		var t = new Throttler();
		expect(t.getIntervalLength() === 2000).toBe(true);
	});
	it('should initialize with config file', function() {
		var t = new Throttler(config);
		expect(t.getIntervalLength() === 1000).toBe(true);
	});
});
