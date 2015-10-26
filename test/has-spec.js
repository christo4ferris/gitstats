var has = require('../src/has');

describe("has", function() {
	it("should return true when property exists", function() {
		var foo = {bar: 'baz'}	
		expect(has(foo, 'bar')).toBe(true);
	});
	it("should return false when property is absent", function() {
		var foo = {barf: 'baz'}	
		expect(has(foo, 'bar')).toBe(false);
	});
});
