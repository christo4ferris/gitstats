/*eslint-env node */
var https = require('https');
var http = require('http');
var events = require('events');
var eventEmitter = new events.EventEmitter();

var orgs = require('./dworgs.json');
var config = require('./config.js');

//var port = config.port || 3000;
//var host = config.host || 'localhost';

var org = '';
var repo = '';
var stack = []; 
var timer = null;
var token = '';

//require(path.join(__dirname, 'routes.js'))(app); // load our routes and pass in our app, config, and fully configured passport

var optionsdb = {
	hostname: config.db.url,
	path: '/',
	port: 5984,
	method: 'PUT',
	keepAlive: true
};


var options = {
	hostname: 'api.github.com',
	port: 443,
	method: 'GET'
};
options.headers = {};
options.headers['User-Agent'] = config.auth.clientid;

// Use this for a personal (OAUTH) token
//options.headers.Authorization = new String('token ' + config.auth.secret);

// Use this for a registered app token
token = '&client_id=' + config.auth.clientid + '&client_secret=' + config.auth.secret;

Date.prototype.getWeekNo = function(){
	var d = new Date(+this);
	d.setHours(0,0,0);
	d.setDate(d.getDate()+4-(d.getDay()||7));
	return Math.ceil((((d-new Date(d.getFullYear(),0,1))/8.64e7)+1)/7);
};

// This is basically an empty shell function
// It could be used for document pre- or post- handling
function insertdb(response) {
	//console.log('--- INSERTDB: statusCode: ', response.statusCode);
	response.on('error', function(e) {
		console.log('--- INSERT_DB: ')
		console.error(e);
	});
	// not needed
	//response.on('data', function(d) {
	//});
	response.on('end', function() {
		if (response.statusCode === 409) {
			console.log('--- INSERT_DB: document already exists.');
		}
	});
}

function has(object, key) {
	return object ? hasOwnProperty.call(object, key) : false;
}

function process() {
	var item = stack.shift();
	//console.log('process: ' + item.opts.path);
	https.request(item.opts, item.func).end();
	if (stack.length === 0) {
		clearInterval(timer);
		timer = null;
	}
}

function throttle(item) {
	stack.push(item);
	if (timer === null) {
		timer = setInterval(process, config.timer);
	}
}

function parse_link_header(header) {
	if (header.length === 0) {
		throw new Error('input must not be of zero length');
	}

	var parts = header.split(',');
	var links = {};
	for(var i=0; i<parts.length; i++) {
		var section = parts[i].split(';');
		if (section.length !== 2) {
			throw new Error('section could not be split on \';\'');
		}
		var url = section[0].replace(/<(.*)>/, '$1').trim();
		var name = section[1].replace(/rel='(.*)'/, '$1').trim();
		links[name] = url;
	}
	return links;
}

function get_pull_requests(response) {
	if (config.collect_pull_requests) {
		var body = '';
		if (response.statusCode != 200) {
			console.log('get_pull_requests: ' + response.url + ' moving on... status:' + response.statusCode);
			console.log('headers: ', response.headers);
			return;
		}
		if (has(response.headers, 'link')) {
			var links = parse_link_header(response.headers.link);
			if (links['next'] != null) {
				var t = new Object();
				t.func = get_pull_requests;
				t.opts = clone(options);
				t.opts.path = links['next'].substring(22, links['next'].length);
				throttle(t);
				console.log(response.headers.link);
				console.log('get_pull_requests: ' + t.opts.path)
			}
		}
		response.on('error', function(e) {
			console.error(e);
		});
		response.on('data', function(d) {
			body += d;
		});
		response.on('end', function() {
			var parsed = JSON.parse(body);
			var doc = {};
			parsed.forEach(function (item) {
			try {
				optionsdb.path = '/' + config.db.name + '/' + item.head.sha;
				var r = item.url.split('/');
				doc.type = 'pull_request'
				doc.org = r[4];
				doc.repo = r[5];
				doc.repofullname = r[4] + '/' + r[5];
				doc.sha = item.head.sha;
				doc.number = item.number;
				doc.state = item.state;
				doc.date = item.created_at;
				doc.commits = item.commits_url;
				doc.user = item.user.login;
				var date = new Date();
				date.setDate(doc.date);
				doc.week = date.getWeekNo();
				doc.url = item.url;
				var db = http.request(optionsdb, insertdb);
				db.write(JSON.stringify(doc));
				db.end();
				// account for pairing situations
				if (has(item.commit, 'author') && item.commit.committer.name != item.commit.author.name) {
					doc.name = item.commit.author.name;
					doc.email = item.commit.author.email;
					db = http.request(optionsdb, insertdb);
					db.write(JSON.stringify(doc));
					db.end();
				}
				console.log('adding pull for author: ',doc.sha,doc.name);
			}
			catch (err) {
				console.log(err);
			}
		});
	});
	}
}

function get_commits(response) {
	if (config.collect_commits) {
		var body = '';
		if (response.statusCode != 200) {
			console.log('get_commits: ' + response.url + ' moving on... status:' + response.statusCode);
			console.log('headers: ', response.headers);
			return;
		}
		if (has(response.headers, 'link')) {
			var links = parse_link_header(response.headers.link);
			if (links['next'] != null) {
				var t = new Object();
				t.func = get_commits;
				t.opts = clone(options);
				t.opts.path = links['next'].substring(22, links['next'].length);
				throttle(t);
				console.log(response.headers.link);
				console.log('get_commits: ' + t.opts.path)
			}
		}
		response.on('error', function(e) {
			console.error(e);
		});
		response.on('data', function(d) {
			body += d;
		});
		response.on('end', function() {
			var parsed = JSON.parse(body);
			var doc = {};
			parsed.forEach(function (item) {
				try {
					optionsdb.path = '/' + config.db.name + '/' + item.sha;
					var r = item.url.split('/');
					doc.type = 'commit'
					doc.org = r[4];
					doc.repo = r[5];
					doc.repofullname = r[4] + '/' + r[5];
					doc.sha = item.sha;
					doc.login = 'unknown';
					if (item.committer != null) doc.login = item.committer.login;
					doc.name = item.commit.committer.name;
					doc.email = item.commit.committer.email;
					doc.date = item.commit.committer.date;
					var date = new Date();
					date.setDate(doc.date);
					doc.week = date.getWeekNo();
					doc.url = item.url;
					var db = http.request(optionsdb, insertdb);
					db.write(JSON.stringify(doc));
					db.end();
					// account for pairing situations
					if (has(item.commit, 'author') && item.commit.committer.name != item.commit.author.name) {
						doc.name = item.commit.author.name;
						doc.email = item.commit.author.email;
						db = http.request(optionsdb, insertdb);
						db.write(JSON.stringify(doc));
						db.end();
					}
					console.log('adding commit for author: ',doc.sha,doc.name);
				}
				catch (err) {
					console.log(err);
				}
			});
		});
	}
}

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

function get_repos(response) {
	var body = '';
	if (response.statusCode != 200) { 
		console.log('get_repos: ' + response.url + ' moving on... status:' + response.statusCode);
		console.log('headers: ', response.headers);
		return; 
	}
	if (has(response.headers, 'link')) {
		var links = parse_link_header(response.headers.link);
		if (links['next'] != null) {
			var t = new Object();
			t.func = get_repos;
			t.opts = clone(options);
			t.opts.path = links['next'].substring(22, links['next'].length);
			throttle(t);
			console.log(response.headers.link);
			console.log('get_repos: ' + t.opts.path);
		}
	}
	response.on('error', function(e) {
		console.error(e);
	});
	response.on('data', function(d) {
		body += d;
	});
	response.on('end', function() {
		var parsed = JSON.parse(body);
		parsed.forEach(function (item) {
			console.log('--- GET REPOS: processing: ' + item.full_name);
			var t = new Object();
			var r = item.full_name.split('/');
			t.opts = clone(options);
			// get commits
			t.func = get_commits;
			t.opts.path = '/repos/' + r[0] + '/' + r[1] + '/commits?per_page=100'  + token;
			throttle(t);
			//console.log('--- GET_REPOS: get_commits: ' + t.opts.path);

			// get pull requests
			t.func = get_pull_requests;
			t.opts.path = '/repos/' + r[0] + '/' + r[1] + '/pulls?per_page=100&state=all'  + token;
			throttle(t);
			//console.log('--- GET REPOS: get_pull_requests: ' + t.opts.path);
		});
	});
}
/*
function delete_db() {
	optionsdb.path = '/' + config.db.name;
	optionsdb.method = 'DELETE';
	http.request(optionsdb, function(response) {
		if (response.statusCode == 200) {
		console.log('--- DELETE_DB: ' + config.db.name + ' has been deleted.');
		eventEmitter.emit('couch_db_deleted');
		}
		else if (response.statusCode == 404) {
				console.log('--- DELETE_DB: ' + config.db.name + ' does not exist.');
				eventEmitter.emit('couch_db_not_exist');
		}
		else {
			console.log('--- DELETE_DB: ', response.statusCode);
			console.log('headers: ', response.headers);
		}
		response.on('error', function(e) {
			console.log('--- DELETE_DB: unknown error');
			console.error(e);
		});
		return;
	}).on('error', function(e){
		console.log('CouchDB does not seem to be running!');
		console.error(e);
	}).end();
}
*/

function create_db() {
	optionsdb.path = '/' + config.db.name;
	optionsdb.method = 'PUT';
	http.request(optionsdb, function(response) {
		if (response.statusCode == 201) {
		console.log('--- CREATE_DB: ' + config.db.name + ' has been created.');
		eventEmitter.emit('couch_db_created');
		}
		else if (response.statusCode == 412) {
				console.log('--- CREATE_DB: ' + config.db.name + ' already exists.');
				eventEmitter.emit('couch_ready');
		}
		else {
			console.log('--- CREATE_DB: ', response.statusCode);
			console.log('headers: ', response.headers);
		}
		response.on('error', function(e) {
			console.log('--- CREATE_DB: unknown error');
			console.error(e);
		});
		return;
	}).on('error', function(e){
		console.log('CouchDB does not seem to be running!');
		console.error(e);
	}).end();
}

function load_orgs() {
	if (orgs.length >= 1) {
		orgs.forEach(function(item) {
			var t = new Object();
			var s = new Object();
			t.opts = clone(options);
			s.opts = clone(options);

			// if this is an 'org' or 'user', put it in the queue to enumerate into a repo
			if((item.type == 'org') || (item.type == 'user'))  {
				t.func = get_repos;
				org = item.name;
				t.opts = clone(options);
				t.opts.path = '/' + item.type + 's/' + org + '/repos?per_page=100' + token;
				throttle(t);
			}

			// if this is a repo, queue up requests for commits and pull_requests
			else if (item.type == 'repo') {
				repo = item.name;

				// create or update the 'last polled' pointer for each repo
				var doc = {};
				optionsdb.path = '/' + config.db.name + '/' + item.name.replace(/\//g, '---');
				doc.type = 'lastpolled';
				doc.repofullname = item.name;
				doc.date = new Date();
				var db = http.request(optionsdb, insertdb);
				db.write(JSON.stringify(doc));
				db.end();
				console.log('--- LOAD_ORGS: repo: ' + optionsdb.path);

				// get commits
				t.func = get_commits;
				t.opts.path = '/repos/' + repo + '/commits?per_page=100' + token;
				throttle(t);
				//console.log('--- LOAD ORGS: get_commits: ' + t.opts.path);

				// get pull requests
				s.func = get_pull_requests;
				s.opts.path = '/repos/' + repo + '/pulls?per_page=100&state=all' + token;
				throttle(s);
				//console.log('--- LOAD ORGS: get_pull_requests: ' + s.opts.path);
			}
		});
	}
}

eventEmitter.once('couch_db_exists', load_orgs);
eventEmitter.once('couch_db_not_exist', create_db);
eventEmitter.once('couch_db_created', load_orgs);
eventEmitter.once('couch_db_deleted', create_db);
eventEmitter.once('couch_ready', load_orgs);

//delete_db();
create_db();

/*
app.listen(port, host, initData);
//delete_db();
//create_db();
console.log('App started on port ' + port);
});


// script for graceful shutdown
process.on( 'SIGINT', function() {
	console.log( '\nGracefully shutting down from SIGINT (Ctrl-C)' );
	process.exit( );
})
*/
