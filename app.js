/*eslint-env node */
var http              = require('http');
var events            = require('events');
var crypto            = require('crypto');
var has               = require('./src/has');
var clone             = require('./src/clone');
//var Throttler       = require('./src/throttle');
var parse_link        = require('./src/parse_link');
var handle_response   = require('./src/handle_response');
var config            = require('./config');
var orgs              = require(config.orgsfile);

var eventEmitter    = new events.EventEmitter();

var optionsdb = {
	path: '/',
	hostname: config.db.host,
	port: config.db.port,
	method: 'PUT',
	keepAlive: true
};
console.log('optionsdb: ' + JSON.stringify(optionsdb));

var options = {
	hostname: 'api.github.com',
	port: 443,
	method: 'GET'
};

var options_es = {
	hostname: config.es.host,
	path: '/',
	port: config.es.port,
	method: 'GET',
	keepAlive: true
}

options.headers = {};
options.headers['User-Agent'] = config.auth.clientid;

//var port          = config.port || 3000;
//var host          = config.host || 'localhost';

//var T               = new Throttler(config);

//require(path.join(__dirname, 'routes.js'))(app); // load our routes and pass in our app, config, and fully configured passport

// Use this for a personal (OAUTH) token
//options.headers.Authorization = new String('token ' + config.auth.secret);

// Use this for a registered app token
var token = '&client_id=' + config.auth.clientid + '&client_secret=' + config.auth.secret;

Date.prototype.getWeekNo = function(){
	var d = new Date(+this);
	d.setHours(0,0,0);
	d.setDate(d.getDate()+4-(d.getDay()||7));
	return Math.ceil((((d-new Date(d.getFullYear(),0,1))/8.64e7)+1)/7);
};

var https = require('https');
var timer = null;
var stack = [];

function process_queue() {
    var item = stack.shift();
    var r = item.opts.path.split('/');
    console.log("PROCESS_QUEUE: ",item.func.name,Array(21-item.func.name.length).join(' '),r[1] === 'repositories' ? 'repo ID: ' + r[2] : r[2] + '/' + r[3]);
    https.request(item.opts, item.func).end();
    if (stack.length === 0) {
        clearInterval(timer);
        timer = null;
    }
}

function throttle(item) {
    stack.push(item);
    if (timer === null) {
      timer = setInterval(process_queue, config.interval);
    }
}

// this will process the link header (if present) and invoke the requested function if a next header is present
function get_more(response, func) {
	if (has(response.headers, 'link')) {
		var links = parse_link(response.headers.link);
		if (links['next'] != null) {
			var t = new Object();
			t.func = func;
			t.opts = clone(options);
			t.opts.path = links['next'].substring(22, links['next'].length);

            if (func.name === 'get_stargazers') {
                // add media headers for GET_STARGAZERS
                t.opts.headers = {
                    'Accept': 'application/vnd.github.v3.star+json',
                    'User-Agent': 'gitstats',
                    'Content-Type': 'application/json'
                }  // see https://developer.github.com/v3/activity/starring
            }
			//T.throttle(t);
            throttle(t);
            var r = t.opts.path.split('/');
			console.log('GET_MORE     : ',func.name,Array(21-func.name.length).join(' '), 'repo ID: ' + r[2]);
		}
	}
}

function get_stargazers(response) {
    var opts = clone(optionsdb);
	var body = '';
	if (response.statusCode != 200) {
		console.log('get_stargazers: ' + response.socket._httpMessage.path + ' moving on... status:' + response.statusCode);
		console.log('headers1: ', response.headers);
		return;
	}
	get_more(response, get_stargazers);
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
                // create a sha digest to be used as the docid
                var shasum = crypto.createHash('sha1');
                shasum.update(response.socket._httpMessage.path + item.starred_at + item.user.login);
                var digest = shasum.digest('hex');
				opts.path = '/' + config.db.name + '/' + digest;
				var r = response.socket._httpMessage.path.split('/');
				doc.type = 'event';
                doc.event = 'stargazer';
                doc.date = item.starred_at
                doc.login = item.user.login;
                doc.login_id = item.user.id;
				var date = new Date(doc.date);
				doc.week = date.getWeekNo();

                // Get the repo full name, or the repo ID
                // The response body for events does not contain the name or ID of the
                // repository, and the nature of the throttling we are performing
                // is such that we can't pass that information down the chain.
                // If there are <100 results, than the response header will contains the
                // repo name.  If there are >100 events, the paging mechanism will
                // return a response header that contains the repo ID.  We capture
                // whichever of those are available, and will perform post-processing
                // elsewhere to ensure both fields are populated.
                r[1] === 'repositories' ? doc.repo_id = r[2] : doc.repofullname = r[2] + '/' + r[3];

				var db = http.request(opts, handle_response);
				db.write(JSON.stringify(doc));
				db.end();
				//console.log('GET_STARGAZERS: ', doc.date, doc.user, doc.user_id, opts.path);
			}
			catch (err) {
                //console.log('GET_STARGAZERS: item: ',item);
                console.log('GET_STARGAZERS: path: ',response.socket._httpMessage.path)
				console.log(err);
			}
		});
	});
}

function get_pull_requests(response) {
	var body = '';
	if (response.statusCode != 200) {
		console.log('get_pull_requests: ' + response.url + ' moving on... status:' + response.statusCode);
		console.log('headers: ', response.headers);
		return;
	}
	get_more(response, get_pull_requests);
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
                var opts = clone(optionsdb);
				opts.path = '/' + config.db.name + '/' + item.head.sha;
				var r = item.url.split('/');
				doc.type = 'pull_request';
				doc.org = r[4];
				doc.repo = r[5];
				doc.repofullname = r[4] + '/' + r[5];
				doc.sha = item.head.sha;
				doc.number = item.number;
				doc.state = item.state;
				doc.date = item.created_at;
				doc.commits = item.commits_url;
				doc.login = item.user.login;
				var date = new Date(doc.date);
				doc.week = date.getWeekNo();
				doc.url = item.url;
				var db = http.request(opts, handle_response);
				db.write(JSON.stringify(doc));
				db.end();
				// account for pairing situations
				// TODO - I think that we need to insert with a new id - hence opts.path needs to be different than above
				if (has(item.commit, 'author') && item.commit.committer.name != item.commit.author.name) {
					doc.name = item.commit.author.name;
					doc.email = item.commit.author.email;
					db = http.request(opts, handle_response);
					db.write(JSON.stringify(doc));
					db.end();
				}
				//console.log('adding pull for author: ',doc.sha,doc.name);
			}
			catch (err) {
				console.log(err);
			}
		});
	});
}

function get_commits(response) {
	if (config.collect_commits) {
		var body = '';
		if (response.statusCode != 200) {
			console.log('get_commits: ' + response.url + ' moving on... status:' + response.statusCode);
			console.log('headers: ', response.headers);
			return;
		}
		get_more(response, get_commits);
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
                    var opts = clone(optionsdb)
					opts.path = '/' + config.db.name + '/' + item.sha;
					var r = item.url.split('/');
					doc.type = 'commit';
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
					var db = http.request(opts, handle_response);
					db.write(JSON.stringify(doc));
					db.end();
					// account for pairing situations
					if (has(item.commit, 'author') && item.commit.committer.name != item.commit.author.name) {
						doc.name = item.commit.author.name;
						doc.email = item.commit.author.email;
						db = http.request(opts, handle_response);
						db.write(JSON.stringify(doc));
						db.end();
					}
                    //console.log('GET_COMMITS: ', doc.sha);
				}
				catch (err) {
					console.log(err);
				}
			});
		});
	}
}

function get_repos(response) {
	var body = '';
	if (response.statusCode != 200) { 
		console.log('get_repos: ' + response.url + ' moving on... status:' + response.statusCode);
		console.log('headers: ', response.headers);
		return; 
	}
	get_more(response, get_repos);
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
			//T.throttle(t);
            throttle(t);
			//console.log('--- GET_REPOS: get_commits: ' + t.opts.path);

			// get pull requests
			if (config.collect_pull_requests) {
				t.func = get_pull_requests;
				t.opts.path = '/repos/' + r[0] + '/' + r[1] + '/pulls?per_page=100&state=all'  + token;
				//T.throttle(t);
                throttle(t);
			}
			//console.log('--- GET REPOS: get_pull_requests: ' + t.opts.path);
		});
	});
}

function delete_db() {
    var opts = clone(optionsdb);
	opts.path = '/' + config.db.name;
	opts.method = 'DELETE';
	http.request(opts, function(response) {
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

function init_db() {
    var doc = {};
    var opts = clone(optionsdb);
    opts.path = '/' + config.db.name +'/_design/views';
    doc.views = {
        "pull_requests": {"map":"function(doc) {\n\tif (doc.type === 'pull_request') {\n\t\tvar es_doc = {};\n\t\tes_doc._rev = doc._rev;\n\t\tes_doc.org = doc.org;\n\t\tes_doc.repo = doc.repo;\n\t\tes_doc.login = doc.login;\n\t\tes_doc.name = doc.name;\n\t\tes_doc.email = doc.email;\n\t\tes_doc.date = doc.date;\n\t\tes_doc.url = doc.url;\n\t\temit(doc.repofullname,es_doc);\n\t}\n}","reduce":"_count"},
        "commits": {"map":"function(doc) {\n\tif (doc.type === 'commit') {\n\t\tvar es_doc = {};\n\t\tes_doc._rev = doc._rev;\n\t\tes_doc.org = doc.org;\n\t\tes_doc.repo = doc.repo;\n\t\tes_doc.login = doc.login;\n\t\tes_doc.name = doc.name;\n\t\tes_doc.email = doc.email;\n\t\tes_doc.date = doc.date;\n\t\tes_doc.url = doc.url;\n\t\temit(doc.repofullname,es_doc);\n\t}\n}","reduce":"_count"}
    }
    doc.language = 'javascript';
    var db = http.request(opts, handle_response);
    db.write(JSON.stringify(doc));
    db.end();
}

function create_db() {
    var opts = clone(optionsdb);
	opts.path = '/' + config.db.name;
	opts.method = 'PUT';
	http.request(opts, function(response) {
		if (response.statusCode == 201) {
        init_db();
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


function get_lastpolled(repo) {
    var deferred = new Promise(function(resolve, reject) {
        var doc = {};
        var opts = clone(optionsdb);
        opts.method = 'GET';
        opts.path = '/' + config.db.name + '/' + repo.replace(/\//g, '---');
        var result = '1970-01-01T00:00:00Z'; // default to earliest UTC value

        http.request(opts, function(res){
            res.on('data', function(chunk) {
                if ((res.statusCode === 200) || (res.statusCode === 304)) {
                    doc = JSON.parse(chunk);
                    //console.log('--- GET_LASTPOLLED: old date: ',doc.repofullname, doc.date);
                    result = doc.date;

                } else {
                    // create the lastpolled document
                    //console.log('--- GET_LASTPOLLED: creating: ',repo);
                    doc.type = 'lastpolled';
                    doc.repofullname = repo;
                }

                // update / create lastpolled doc
                opts.method = 'PUT'
                doc.date = new Date().toISOString();
                var db = http.request(opts, handle_response);
                db.write(JSON.stringify(doc))
                db.end();
                //console.log('--- GET_LASTPOLLED: new date: ',doc.repofullname, doc.date);
                resolve(result);
            });
            res.on('error', function(e) {
                reject(e);
            });
        }).end();
    });
    return deferred; // <--- happens IMMEDIATELY (object that promise listens on)
}

function load_orgs() {
	if (orgs.length >= 1) {
		orgs.forEach(function(item) {
			var t = new Object();
			var s = new Object();
            var u = new Object();
			t.opts = clone(options);
			s.opts = clone(options);
            u.opts = clone(options);

			// if this is an 'org' or 'user', put it in the queue to enumerate into a repo
			if((item.type == 'org') || (item.type == 'user'))  {
				t.func = get_repos;
				var org = item.name;
				t.opts = clone(options);
				t.opts.path = '/' + item.type + 's/' + org + '/repos?per_page=100' + token;
				//T.throttle(t);
                throttle(t);
			}

			// if this is a repo, queue up requests for commits and pull_requests
			else if (item.type == 'repo') {
				var repo = item.name;

				// create or update the 'last polled' pointer for each repo
                Promise.resolve(get_lastpolled(repo)
                    .then (function (result) {
                        var since = '&since=' + result;
                        //console.log('--- LOAD_ORGS: ' + t.opts.path, result);

                        // get commits
                        t.func = get_commits;
                        t.opts.path = '/repos/' + repo + '/commits?per_page=100' + since + token;
                        //T.throttle(t);
                        throttle(t);
                        //console.log('--- LOAD ORGS: get_commits: ' + t.opts.path);

                        // get pull requests
                        s.func = get_pull_requests;
                        s.opts.path = '/repos/' + repo + '/pulls?per_page=100&state=all' + since + token;
                        //T.throttle(s);
                        throttle(s);
                        //console.log('--- LOAD ORGS: get_pull_requests: ' + s.opts.path);

                        // get stargazers
                        u.func = get_stargazers;
                        u.opts.method = 'GET'
                        u.opts.path = '/repos/' + repo + '/stargazers?per_page=100' + token;  // event api does not offer a "since" atttribute
                        u.opts.headers = {
                            'Accept': 'application/vnd.github.v3.star+json',
                            'User-Agent': 'gitstats',
                            'Content-Type': 'application/json'
                        };  // see https://developer.github.com/v3/activity/starring
                        //T.throttle(u);
                        throttle(u);
                        //console.log('--- LOAD ORGS: get_stargazers: ' + u.opts.path);
                    })
                    .catch(function (reason) {
                        throw new Error('LOAD_ORGS: error: ', reason.response.statusCode, reason.error.message);
                    })
                );
			}
		});
	}
}

function sync_es(){
    var opts = clone(options_es);
    opts.path = '/_bulk';
    opts.method = 'POST';
    var action = { "index" : { "_index" : "cloudviz---agentless-system-crawler", "_type" : "commit", "_id" : "262900e8ca69293e5493553545cb51c87aedb1b9" } };
    var source = { "doc":{"_rev": "1-4cb1e8f1be4a094aa28ec4960a679bef","org": "cloudviz","repo": "agentless-system-crawler","login": "cloudviz","name": "CLOUD VIZ","email": "cloudviz2015@gmail.com","date": "2015-07-20T18:34:40Z","url": "https://api.github.com/repos/cloudviz/agentless-system-crawler/commits/262900e8ca69293e5493553545cb51c87aedb1b9"}};
    var action2 = { "index" : { "_index" : "cloudviz---agentless-system-crawler", "_type" : "commit", "_id" : "262900e8ca69293e5493553545cb51c87aedb110" } };
    var source2 = { "doc":{"_rev": "1-4cb1e8f1be4a094aa28ec4960a679bef","org": "cloudviz","repo": "agentless-system-crawler","login": "cloudviz","name": "CLOUD VIZ","email": "cloudviz2015@gmail.com","date": "2015-07-20T18:34:40Z","url": "https://api.github.com/repos/cloudviz/agentless-system-crawler/commits/262900e8ca69293e5493553545cb51c87aedb1b9"}};
    var action3 = { "index" : { "_index" : "node-red---node-red", "_type" : "commit", "_id" : "262900e8ca69293e5493553545cb51c87aedb111" } };
    var source3 = { "doc":{"_rev": "1-4cb1e8f1be4a094aa28ec4960a679bef","org": "cloudviz","repo": "agentless-system-crawler","login": "cloudviz","name": "CLOUD VIZ","email": "cloudviz2015@gmail.com","date": "2015-07-20T18:34:40Z","url": "https://api.github.com/repos/cloudviz/agentless-system-crawler/commits/262900e8ca69293e5493553545cb51c87aedb1b9"}};

    var db = http.request(opts, handle_response);
    var body = JSON.stringify(action) + '\n' + JSON.stringify(source) + '\n' + JSON.stringify(action2) + '\n' + JSON.stringify(source2) + '\n' + JSON.stringify(action3) + '\n' + JSON.stringify(source3) + '\n';
    console.log(body);
    db.write(body);
    db.end();
}

function print_help(){
    console.log('\nUsage: node app.js [option]\n');
    console.log('Options:');
    console.log('\t-c, --collect\tcreate a database (if necessary) and collect stats generated since the last run');
    console.log('\t--deletedb\tre-create the database and collect stats');
    console.log('\t--es\t\tupdate ElasticSearch indexes');
    console.log('\t-h, --help\tprint help (this message)\n');
}

eventEmitter.once('couch_db_exists', load_orgs);
eventEmitter.once('couch_db_not_exist', create_db);
eventEmitter.once('couch_db_created', load_orgs);
eventEmitter.once('couch_db_deleted', create_db);
eventEmitter.once('couch_ready', load_orgs);

var arg_deletedb  = process.argv.indexOf('--deletedb') != -1 ? true : false;
var arg_help      = (process.argv.indexOf('-h') != -1) || (process.argv.indexOf('--help') != -1) ? true : false;
var arg_collect   = (process.argv.indexOf('-c') != -1) || (process.argv.indexOf('--collect') != -1) ? true : false;
var arg_es        = process.argv.indexOf('--es') != -1 ? true : false;

if (arg_help || (process.argv.length===2)) print_help();

if (arg_deletedb) delete_db();

if (arg_collect) create_db();

if (arg_es) sync_es();


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
