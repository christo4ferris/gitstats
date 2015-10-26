'use strict';

const Throttler = require('../src/throttle');

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
	describe('setIntervalLength', function() {
		var t = new Throttler(config);
		it('should throw an exception if passed invalid arg', function() {
			expect(function(){t.setIntervalLength('foo')}).toThrow(new Error('setIntervalLength: invalid argument: must be an integer'));
		});
		it('should change the interval', function() {
			t.setIntervalLength(3000);
			expect(t.getIntervalLength()).toBe(3000);
		});
		it('should accept a stringified integer', function() {
			t.setIntervalLength('3000');
			expect(t.getIntervalLength()).toBe(3000);
		});
	});
	describe('getIntervalLength', function() {
		it('should return the value of interval', function() {
			var t = new Throttler(config);
			expect(t.getIntervalLength()).toBe(1000);
		});
	});
});
