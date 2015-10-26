var clone = require('../src/clone');

describe("clone", function() {
	var x = {a: 'b', c: 'd'}	
	var y = clone(x);
	it("should return a different object", function() {
		expect(x !== y).toBe(true);
	});
	it("should return an equivalent object", function() {
		expect(JSON.stringify(x) === JSON.stringify(y)).toBe(true);
	});
});
