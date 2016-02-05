/*eslint-env node */
var crypto            = require('crypto');
var has               = require('./src/has');
var clone             = require('./src/clone');
var http              = require('http');
var https             = require('https');
//var Throttler       = require('./src/throttle');
var parse_link        = require('./src/parse_link');
var handle_response   = require('./src/handle_response');
var config            = require('./config');
var orgs              = require(config.orgsfile);
var uuid              = require('uuid');
var fetch             = require('node-fetch');
var gittoken          = config.git.personaltoken;
var db_protocol       = config.db.protocol === 'https:' ? https : http;
var git_protocol      = config.git.protocol === 'https:' ? https : http;
var timer             = null;
var stack             = [];
var processed_count   = 0;

// initialize Logging for IBM BlueMix
var winston           = require('winston');
var bluemix           = require('ibmbluemix');
var logconfig = {
    transports: [
        new (winston.transports.Console)()
    ] ,
    filename:true,
    methodname:true,
    linenumber: true
};
var logger            = bluemix.getLogger(logconfig);

var port              = (process.env.VCAP_APP_PORT || 3000);
var host              = (process.env.VCAP_APP_HOST || 'localhost');

var optionsdb = {
    keepAlive : true,
    agent: db_keepAliveAgent,
	path: '/' + config.db.name,
	host: config.db.host,
	port: config.db.port,
    protocol: config.db.protocol,
	method: 'PUT'
};

if (config.db.user != '') {
    optionsdb.url = config.db.protocol + '//' + config.db.user + ':' + config.db.password + '@' + config.db.host;
    optionsdb.headers = { 'Authorization': 'Basic ' + new Buffer(config.db.user + ':' + config.db.password).toString('base64')}
}

// make sure a GitHub token has been configured
if (config.git.personaltoken === '') {
  console.log('---: GitHub credentials not provided.  You MUST set a personal access token in the config.js file.')
  process.exit();
}

var optionsgit = {
    keepAlive : true,
	hostname: config.git.hostname,
	port: config.git.port,
    protocol: config.git.protocol,
	method: 'GET',
    headers: {
        'User-Agent': 'gitstats',
        'Content-Type': 'application/json'
    }
};

var db_keepAliveAgent = new db_protocol.Agent(optionsdb);
var git_keepAliveAgent = new git_protocol.Agent(optionsgit);

//var T               = new Throttler(config);




Date.prototype.getWeekNo = function(){
	var d = new Date(+this);
	d.setHours(0,0,0);
	d.setDate(d.getDate()+4-(d.getDay()||7));
	return Math.ceil((((d-new Date(d.getFullYear(),0,1))/8.64e7)+1)/7);
};


function process_queue() {
        var item          = stack.shift();
        var req_protocol  = item.opts.protocol === 'https:' ? https : http;
        var r = item.opts.path.split('/');
        if (!item.hasOwnProperty('source')) item.source = 'other';
        console.log('PROCESS_QUEUE: START: item/stack size/processed: ',
                    item.counter + '/' + stack.length + '/' + processed_count, item.func.name,
                    Array(21-item.func.name.length).join(' '),item.source,
                    Array(10-item.source.length).join(' '),
                    r[1] === 'repositories' ? 'repo ID: ' + r[2] : r[2] + '/' + r[3]);

        var req = req_protocol.request(item.opts, item.func);

        req.on('error', function(e) {
            console.log('--- PROCESS_QUEUE: ERROR: ', e.message);
            console.log(e.stack);
            console.error(e);
        });

        req.setTimeout(2000, function(){
            console.log('--- WARNTIMEOUT', item.counter);
            req.end();
        });

        req.end(function(){
          processed_count = processed_count + 1;
          var index = openqueue.indexOf(item.counter);
          if( index > -1) {
              openqueue.splice(index,1);
              donequeue.splice(index,1);
          }
          console.log('PROCESS_QUEUE: END: ', item.counter, '# of open requests: ',openqueue.toString());
        });
  
        if (stack.length === 0) {
            clearInterval(timer);
            timer = null;
            console.log('PROCESS_QUEUE: queue is empty');
        }
}

var counter = 0;
var openqueue = [];
var donequeue = [];

function throttle(item) {
    counter++;
    item.counter = counter;
    stack.push(item);
    openqueue.push(counter);
    donequeue.push(item);
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
			t.opts = clone(optionsgit);
			t.opts.path = links['next'].substring(22, links['next'].length);
            t.source = 'get_more';

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
			console.log('GET_MORE     : ',func.name,Array(21-func.name.length).join(' '), t.opts.path);
		}
	}
}

function get_stargazers(response) {
    var body = '';
    if (response.statusCode != 200) {
        console.log('get_stargazers: ' + response.socket._httpMessage.path + ' moving on... status:' + response.statusCode);
        //console.log('headers: ', response.headers);
        return;
    }
    get_more(response, get_stargazers);
    response.on('error', function(e) {
        console.log('--- GET_STARGAZERS: error: ');
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
                // create a sha digest to be used as the docid
                var shasum = crypto.createHash('sha1');
                //shasum.update(response.socket._httpMessage.path + item.starred_at + item.user.login);
                shasum.update(item.starred_at + item.user.login);
                var digest = shasum.digest('hex');
                opts.path += '/' + digest;
                var r = response.socket._httpMessage.path.split('/');
                doc.type = 'event';
                doc.count = 1;
                doc.event = 'stargazer';
                doc.date = item.starred_at
                doc.login = item.user.login;
                doc.login_id = item.user.id;
                var date = new Date(doc.date);
                doc.week = date.getWeekNo();
                doc.url = item.url;
                // Get the repo full name, or the repo ID
                // The response body for events does not contain the name or ID of the
                // repository, and the nature of the throttling we are performing
                // is such that we can't pass that information down the chain.
                // If there are <100 results, than the response header will contains the
                // repo name.  If there are >100 events, the paging mechanism will
                // return a response header that contains the repo ID.  We capture
                // whichever of those are available, and will perform post-processing
                // elsewhere to ensure both fields are populated.
                r[1] === 'repositories' ? doc.repo_id = r[2] : doc.repofullname = (r[2] + '/' + r[3]).toLowerCase();

                var db = db_protocol.request(opts, handle_response);
                db.write(JSON.stringify(doc));
                db.end();
                //console.log('GET_STARGAZERS: ', doc.date, doc.user, doc.user_id, opts.path);
            }
            catch (err) {
                //console.log('GET_STARGAZERS: item: ',item);
                console.log('GET_STARGAZERS: path: ',response.socket._httpMessage.path)
                console.error(err);
            }
        })
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
				opts.path += '/' + item.head.sha;
				var r = item.url.split('/');
				doc.type = 'pull_request';
                doc.name = item.name;
				doc.org = r[4];
				doc.repo = r[5];
				doc.repofullname = (r[4] + '/' + r[5]).toLowerCase();
				doc.sha = item.head.sha;
				doc.number = item.number;
				doc.state = item.state;
				doc.date = item.created_at;
				doc.commits = item.commits_url;
				doc.login = item.user.login;
				var date = new Date(doc.date);
				doc.week = date.getWeekNo();
				doc.url = item.url;
				var db = db_protocol.request(opts, handle_response);
				db.write(JSON.stringify(doc));
				db.end();

				// account for pairing situations - opts.path needs to be different than above
				if (has(item.commit, 'author') && item.commit.committer.name != item.commit.author.name) {
                    opts.path += '-2';
					doc.name = item.commit.author.name;
					doc.email = item.commit.author.email;
					var db2 = db_protocol.request(opts, handle_response);
					db2.write(JSON.stringify(doc));
					db2.end();
				}

				//console.log('--- GET_PULL_REQUESTS: ',doc.sha,doc.name);
			}
			catch (err) {
				console.log('--- GET_PULL_REQUESTS: path: ',response.socket._httpMessage.path)
				console.error(err);
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
		response.on('error', function(err) {
            console.log('--- GET_COMMITS: path: ',response.socket._httpMessage.path)
			console.error(err);
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
					opts.path += '/' + item.sha;
					var r = item.url.split('/');
					doc.type = 'commit';
                    doc.name = item.name;
					doc.org = r[4];
					doc.repo = r[5];
					doc.repofullname = (r[4] + '/' + r[5]).toLowerCase();
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
					var db = db_protocol.request(opts, handle_response);
					db.write(JSON.stringify(doc));
                    db.end();

					// account for pairing situations - opts.path needs to be different than above
					if (has(item.commit, 'author') && item.commit.committer.name != item.commit.author.name) {
                    opts.path += '-2';

                        doc.name = item.commit.author.name;
						doc.email = item.commit.author.email;
						var db2 = db_protocol.request(opts, handle_response);
						db2.write(JSON.stringify(doc));
						db2.end();
					}
                    //console.log('GET_COMMITS: ', doc.sha);
				}
				catch (err) {
					console.log('--- GET_COMMITS: path: ',response.socket._httpMessage.path)
                    console.error(err);
				}
			});
		});
	}
}

function get_repos(response) {
	var body = '';
  console.log('--- GET REPOS: ');
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
            var s = new Object();
            var u = new Object();
			var r = item.full_name.split('/');
			t.opts = clone(optionsgit);
            s.opts = clone(optionsgit);
            u.opts = clone(optionsgit);

			// get commits
            if (config.collect_commits) {
                t.func = get_commits;
                t.opts.path = '/repos/' + r[0] + '/' + r[1] + '/commits?per_page=100' + '&access_token=' + gittoken + id + '&call=commits';
                //T.throttle(t);
                throttle(t);
                //console.log('--- GET_REPOS: get_commits: ' + t.opts.path);
            }

			// get pull requests
			if (config.collect_pull_requests) {
                  s.func = get_pull_requests;
                  s.opts.path = '/repos/' + r[0] + '/' + r[1] + '/pulls?per_page=100&state=all' + '&access_token=' + gittoken + id + '&call=pulls';
                  s.source = 'get_repos';
                  //T.throttle(s);
                  throttle(s);
                  //console.log('--- GET REPOS: get_pull_requests: ' + s.opts.path);
			}

            // get stargazers
            if (config.collect_stargazers) {
                u.func = get_stargazers;
                u.opts.method = 'GET';
                u.opts.path = '/repos/' + r[0] + '/' + r[1] + '/stargazers?per_page=100' + '&access_token=' + gittoken + id + '&call=stars';  // event api does not offer a "since" atttribute
                u.opts.headers = {
                    'Accept': 'application/vnd.github.v3.star+json',
                    'User-Agent': 'gitstats',
                    'Content-Type': 'application/json'
                };  // see https://developer.github.com/v3/activity/starring
                //T.throttle(u);
                throttle(u);
                //console.log('--- LOAD ORGS: get_stargazers: ' + u.opts.path);
            }
		});
	});
}

function delete_db() {
    var opts = clone(optionsdb);
	opts.method = 'DELETE';
	var req = db_protocol.request(opts, function(response) {
        console.log('--- DELETE_DB: connected:');

		response.on('error', function(e) {
			console.log('--- DELETE_DB: unknown error');
			console.error(e);
		});

        response.on('data', function(){
          // we don't care about data here, but have to listen for it.
        });

        response.on('end', function(){
            if (response.statusCode === 200) {
                console.log('--- DELETE_DB: ' + config.db.name + ' has been deleted.');
                create_db();
            }
            else if (response.statusCode === 404) {
                console.log('--- DELETE_DB: ' + config.db.name + ' does not exist.');
                create_db();
            }
            else {
                console.log('--- DELETE_DB: ', response.statusCode);
                console.log('headers: ', response.headers);
                //console.log(JSON.stringify(opts));
            }
        })
	});

    req.on('error', function(e){
		console.log('CouchDB does not seem to be running!');
		console.error(e);
	});

    req.end();
}

function init_db() {
    var doc = {};
    var opts = clone(optionsdb);
    opts.path += '/_design/views';
    doc.views = {
        "pull_requests": {"map":"function(doc) {\n\tif (doc.type === 'pull_request') {\n\t\tvar es_doc = {};\n\t\tes_doc._rev = doc._rev;\n\t\tes_doc.org = doc.org;\n\t\tes_doc.repo = doc.repo;\n\t\tes_doc.login = doc.login;\n\t\tes_doc.name = doc.name;\n\t\tes_doc.email = doc.email;\n\t\tes_doc.date = doc.date;\n\t\tes_doc.url = doc.url;\n\t\temit(doc.repofullname,es_doc);\n\t}\n}","reduce":"_count"},
        "commits": {"map":"function(doc) {\n\tif (doc.type === 'commit') {\n\t\tvar es_doc = {};\n\t\tes_doc._rev = doc._rev;\n\t\tes_doc.org = doc.org;\n\t\tes_doc.repo = doc.repo;\n\t\tes_doc.login = doc.login;\n\t\tes_doc.name = doc.name;\n\t\tes_doc.email = doc.email;\n\t\tes_doc.date = doc.date;\n\t\tes_doc.url = doc.url;\n\t\temit(doc.repofullname,es_doc);\n\t}\n}","reduce":"_count"},
        "events": {"map":"function(doc) {\n\tif (doc.type === 'event') {\n\t\temit(doc.date,doc);\n\t}\n}","reduce":"_count"},
        "projects": {"map":"function(doc) {\n\tif (doc.type === 'lastpolled') {\n\t\tvar harveyballs = [\n\t\t\t'<div class=\"harvey25 center\"></div>',\n\t\t\t'<div class=\"harvey50 center\"></div>',\n\t\t\t'<div class=\"harvey75 center\"></div>',\n\t\t\t'<div class=\"harvey100 center\"></div>'\n\t\t];\n\t\temit(doc.repofullname, {\n\t\t\t'project':doc.repofullname,\n\t\t\t'one':harveyballs[0],\n\t\t\t'two':harveyballs[1],\n\t\t\t'three':harveyballs[2],\n\t\t\t'four':harveyballs[3],\n\t\t\t'five':harveyballs[2]\n\t\t});\n\t}\n}","reduce":"_count"},
        "unique_contributors": {"map":"function(doc) {\n\tif (doc.type === 'commit') {\n\t\temit([doc.repofullname,doc.login], 1);\n\t}\n}\n","reduce":"function (keys, values) {\n\treturn sum(values);\n}\n"},
        "commits-by-repo": {"map":"function(doc) {\n\tif (doc.type === 'commit') {\n\t\temit([doc.repofullname], 1);\n\t}\n}\n","reduce":"function (keys, values) {\n\treturn sum(values);\n}\n"}
    }
    doc.language = 'javascript';
    var db = db_protocol.request(opts, handle_response);
    db.write(JSON.stringify(doc));
    db.end();
}

function create_db() {
    if (stack.length === 0)
    {
        var opts = clone(optionsdb);
        opts.method = 'PUT';
        var req = db_protocol.request(opts, function(response) {
            console.log('--- CREATE_DB: connected:');

            response.on('error', function(e) {
                console.log('--- CREATE_DB: unknown error');
                console.error(e);
            });

            response.on('data', function(){
              // we don't care about data here, but have to listen for it.
            });

            response.on('end', function(){
                if (response.statusCode === 201) {
                  init_db();
                  console.log('--- CREATE_DB: ' + config.db.name + ' has been created.');
                  load_orgs();
                }
                else if (response.statusCode === 412) {
                    console.log('--- CREATE_DB: ' + config.db.name + ' already exists.');
                    load_orgs();
                }
                else {
                    console.log('--- CREATE_DB: ', response.statusCode);
                    console.log('headers: ', response.headers);
                }
            })
        });

        req.on('error', function(e){
            console.log('CouchDB does not seem to be running!');
            console.error(e);
        });

        req.end();
    }
}


/*
    This function improves the efficiency of GitHub synchronization.

    It queries the database for a "lastpolled" document for each
    repository in the watchlist.  If none exists, gitstats will pull stats
    for the repo since "the beginning of time"; otherwise, it will only
    pull stats beginning at the date indicated in the lastpolled document.
    In either case, a lastpolled document will be created/updated with a
    current datetime stamp.
*/
function get_lastpolled(repo) {
    var deferred = new Promise(function(resolve, reject) {
        var doc = {};
        var opts = clone(optionsdb);
        opts.method = 'GET';
        opts.path += '/' + repo.replace(/\//g, '---');
        var result = {};
        result.date = '1970-01-01T00:00:00Z'; // default to earliest UTC value

        var req = db_protocol.request(opts, function(res){
            res.on('data', function(chunk) {
                if ((res.statusCode === 200) || (res.statusCode === 304)) {
                    doc = JSON.parse(chunk);
                    //console.log('--- GET_LASTPOLLED: old date: ',doc.repofullname, doc.date);
                    result.date = doc.date;
                    result.create_webhook = false;

                } else {
                    // create the lastpolled document
                    //console.log('--- GET_LASTPOLLED: creating: ',repo);
                    doc.type = 'lastpolled';
                    doc.repofullname = repo;
                }

                // update / create lastpolled doc
                opts.method = 'PUT';
                doc.date = new Date().toISOString();
                var db = db_protocol.request(opts, handle_response);
                db.write(JSON.stringify(doc));
                db.end();
                console.log('--- GET_LASTPOLLED: new date: ',doc.repofullname, doc.date);
                resolve(result);
            });
            res.on('error', function(e) {
                reject(e);
            });
        });

        req.end();
    });
    return deferred; // <--- happens IMMEDIATELY (object that promise listens on)
}

function load_orgs() {
	if (orgs.length >= 1) {
		orgs.forEach(function(item) {
			var t = new Object();
			var s = new Object();
            var u = new Object();
			t.opts = clone(optionsgit);
			s.opts = clone(optionsgit);
            u.opts = clone(optionsgit);

			// if this is an 'org' or 'user', put it in the queue to enumerate into a repo
			if((item.type === 'org') || (item.type === 'user'))  {
				t.func = get_repos;
				var org = item.name;
				t.opts = clone(optionsgit);
				t.opts.path = '/' + item.type + 's/' + org + '/repos?per_page=100';
                t.source = 'load_orgs';
				//T.throttle(t);
                throttle(t);
			}

			// if this is a repo, queue up requests for commits and pull_requests
			else if (item.type == 'repo') {
				var repo = item.name;

				// create or update the 'last polled' pointer for each repo
                Promise.resolve(get_lastpolled(repo)
                    .then (function (result) {
                        var since = '&since=' + result.date;
                        var id = uuid.v4();

                        // get commits
                        if (config.collect_commits) {
                            t.func = get_commits;
                            t.opts.path = '/repos/' + repo + '/commits?per_page=100' + since + '&access_token=' + gittoken + '&id=' + id + '&call=commits';
                            //T.throttle(t);
                            throttle(t);
                            //console.log('--- LOAD ORGS: get_commits: ' + t.opts.path);
                        }

                        // get pull requests
                        if (config.collect_pull_requests) {
                            s.func = get_pull_requests;
                            s.opts.path = '/repos/' + repo + '/pulls?per_page=100&state=all' + since + '&access_token=' + gittoken + '&id=' + id + '&call=pulls';;
                            s.source = 'load_orgs';
                            //T.throttle(s);
                            throttle(s);
                            //console.log('--- LOAD ORGS: get_pull_requests: ' + s.opts.path);
                        }

                        // get stargazers
                        if (config.collect_stargazers) {
                            u.func = get_stargazers;
                            u.opts.method = 'GET';
                            u.opts.path = '/repos/' + repo + '/stargazers?per_page=100' + '&access_token=' + gittoken + '&id=' + id + '&call=stars';;  // event api does not offer a "since" atttribute
                            u.opts.headers = {
                                'Accept': 'application/vnd.github.v3.star+json',
                                'User-Agent': 'gitstats',
                                'Content-Type': 'application/json'
                            };  // see https://developer.github.com/v3/activity/starring
                            //T.throttle(u);
                            throttle(u);
                            //console.log('--- LOAD ORGS: get_stargazers: ' + u.opts.path);
                        }
                    })
                    .catch(function (reason) {
                        throw new Error('LOAD_ORGS: error: ', reason.response.statusCode, reason.error.message);
                    })
                );
			}
		});
	}
}


function print_help(){
    console.log('\nUsage: node app.js [option]\n');
    console.log('Options:');
    console.log('\t-c, --collect\tcreate a database (if necessary) and collect stats generated since the last run');
    console.log('\t--deletedb\tre-create the database and collect stats');
    console.log('\t-h, --help\tprint help (this message)\n');
}


function initServer() {
    console.log('Initializing gitstats microservice...');
    var arg_deletedb  = process.argv.indexOf('--deletedb') != -1 ? true : false;
    var arg_help      = (process.argv.indexOf('-h') != -1) || (process.argv.indexOf('--help') != -1) ? true : false;
    var arg_collect   = (process.argv.indexOf('-c') != -1) || (process.argv.indexOf('--collect') != -1) ? true : false;

    if (arg_help || (process.argv.length===2)) print_help();

    if (arg_deletedb) delete_db();

    if (arg_collect) create_db();

    if (!(arg_deletedb || arg_help || arg_collect)) {
        delete_db()
        //console.log('\n--- GITSTATS: No known argument provided - did you forget to use "-" or "--"?  Use -h for help!');
        //server.close();
    }
}

process.on('uncaughtException', function (er) {
    console.log('---UNCAUGHT EXCEPTION: >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    console.log('open requests: ' + openqueue.toString());
    console.error(er.stack);
    console.log('---UNCAUGHT EXCEPTION: <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
    if ((stack.length === 0) && (donequeue.length > 0)) {
/*        donequeue.forEach(function(item) {
            throttle(item);
            console.log('--- REQUEUING: ', item.count, item.uuid);
        })*/
/*        stack = donequeue;
        donequeue = []
        process_queue();*/
    } else if (stack.length === 0) {
        clearInterval(timer);
        timer = null;
    } else {
      process_queue();
    }
});


// set timer for hourly refresh
setInterval(function () {
  create_db();
  console.log('---: Refreshed data at: ' + Date.now());
}, 3600000);



function handleRequest(request, response){
    response.end('--- HANDLEREQUEST: ' + request.url);
}

var server = http.createServer(handleRequest);

server.listen(port, host, function(){
    initServer();
    console.log('Server listening on:', host, port);
});

/*
app.listen(port, host, initData);
//delete_db();
//create_db();
console.log('App started on port ' + port);
});
*/

// script for graceful shutdown
process.on( 'SIGINT', function() {
    console.log( '\nGracefully shutting down from SIGINT (Ctrl-C)' );
    clearInterval(timer);
    timer = null;
    process.exit();
})
