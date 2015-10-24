var has = require('../has.js');

describe("gitstats", function() {
	describe("has", function() {
		it("should find the property", function() {
			var foo = {bar: 'baz'}	
			expect(has(foo, 'bar')).toBe(true);
		});
		it("should not find the property", function() {
			var foo = {barf: 'baz'}	
			expect(has(foo, 'bar')).toBe(false);
		});
	});
});
