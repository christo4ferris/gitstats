/*eslint-env node */
module.exports = function (object, key) {
	return object ? hasOwnProperty.call(object, key) : false;
}
