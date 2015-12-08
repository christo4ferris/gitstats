/*eslint-env node */
module.exports = function (response) {
	response.on('error', function(e) {
		console.log('--- HANDLE_RESPONSE: ')
		console.error(e);
	});

    response.on('data', function() {
        // we don't care about data here, but have to listen for it.
    });

	response.on('end', function() {
        switch(response.statusCode) {
            case 409:
                //console.log('--- HANDLE_RESPONSE: conflict - document already exists.');
                break;
            case 412:
                console.log('--- HANDLE_RESPONSE: precondition failed - headers do not match.');
                break;
            case 200:
                console.log('--- HANDLE_RESPONSE: ok - success.');
                break;
            case 201:
                //console.log('--- HANDLE_RESPONSE: created/updated.');
                break;
            default:
                console.log('--- HANDLE_RESPONSE:', response.statusCode);
                break;
        }
	});
}
