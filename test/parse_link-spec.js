var parse_link = require('../src/parse_link');

describe("parse_link", function() {
	var header = '<https://api.github.com/user/repos?page=3&per_page=100>; rel="next", <https://api.github.com/user/repos?page=50&per_page=100>; rel="last";';
	//var header = '<https://api.github.com/user/repos?page=3&per_page=100>; rel="next";';
	var links = parse_link(header);
	var empty = '';
	it('should throw an exception on empty header', function() {
		expect(function() {parse_link(empty)}).toThrow('input must not be of zero length');
	});
	it('should return an Array', function() {
		expect(links instanceof Array).toBe(true);
	});
	it('should return correct next link', function() {
		expect(links['next']).toBe('https://api.github.com/user/repos?page=3&per_page=100');
	});
	it('should return correct last link', function() {
		expect(links['last']).toBe('https://api.github.com/user/repos?page=50&per_page=100');
	});
	it('should throw an exception if not at least one pair', function() {
		var header = 'rel="next", <https://api.github.com/user/repos?page=50&per_page=100>; rel="last";';
		expect(function(){parse_link(header)}).toThrow(new Error('section could not be split on ";" length=' + 1));
	});
});
