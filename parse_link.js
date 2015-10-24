/*eslint-env node */
module.exports = function (header) {
	if (header.length === 0) {
		throw new Error('input must not be of zero length');
	}

	var parts = header.split(',');
	var links = [];
	for(var i=0; i<parts.length; i++) {
		var section = parts[i].split(';');
		if (section.length < 2) {
			throw new Error('section could not be split on ";" length=' + section.length);
		}
		var url = section[0].replace(/<(.*)>/, '$1').trim();
		var name = section[1].replace(/rel="(.*)"/, '$1').trim();
		console.log('url= ' + url);
		console.log('name= ' + name);
		links[name] = url;
	}
	return links;
}
