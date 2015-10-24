var app = require('../app.js');

describe("gitstats", function() {
	describe("has", function() {
		it("should find the property", function() {
			var foo = {bar: 'baz'}	
			expect(app.has(foo, 'bar')).toBe(true);
		});
		it("should not find the property", function() {
			var foo = {barf: 'baz'}	
			expect(app.has(foo, 'bar')).toBe(false);
		});
	});
	describe("parse_link_header", function() {
		//var header = '<https://api.github.com/user/repos?page=3&per_page=100>; rel="next", <https://api.github.com/user/repos?page=50&per_page=100>; rel="last";';
		var header = '<https://api.github.com/user/repos?page=3&per_page=100>; rel="next";';
		var links = app.parse_link_header(header);
		it("should return an Array", function() {
			expect(links instanceof Array).toBe(true);
		});
		it("should find two links", function() {
			expect(links.length).toBe(2);
		});
	});
});
