var https = require('https');
var http = require('http');
var events = require('events');
var eventEmitter = new events.EventEmitter();

var orgs = require('./dworgs.json');
var config = require('./config.js');

var org = "";
var repo = "";
var stack = []; 
var timer = null;
var token = "";

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
//options.headers.Authorization = new String("token " + config.auth.secret);
token = "&client_id=" + config.auth.clientid + "&client_secret=" + config.auth.secret;
options.headers["User-Agent"] = config.auth.clientid;

Date.prototype.getWeekNo = function(){
    var d = new Date(+this);
    d.setHours(0,0,0);
    d.setDate(d.getDate()+4-(d.getDay()||7));
    return Math.ceil((((d-new Date(d.getFullYear(),0,1))/8.64e7)+1)/7);
};

function insertdb(response) {
    var b = '';
    //console.log("insertdb statusCode: ", response.statusCode);
    response.on('error', function(e) {
        console.error(e);
    });
    response.on('data', function(d) {
        b += d;
    });
    response.on('end', function() {
    });
};

function has(object, key) {
      return object ? hasOwnProperty.call(object, key) : false;
};

function process() {
    var item = stack.shift();
    console.log("process: " + item.opts.path);
    https.request(item.opts, item.func).end();
    if (stack.length === 0) {
        clearInterval(timer);
        timer = null;
    };
};

function throttle(item) {
    stack.push(item);
    if (timer === null) {
        timer = setInterval(process, 2100);
    };
};

function parse_link_header(header) {
    if (header.length === 0) {
            throw new Error("input must not be of zero length");
        }

    var parts = header.split(',');
    var links = {};
    for(var i=0; i<parts.length; i++) {
        var section = parts[i].split(';');
        if (section.length !== 2) {
            throw new Error("section could not be split on ';'");
        }
        var url = section[0].replace(/<(.*)>/, '$1').trim();
        var name = section[1].replace(/rel="(.*)"/, '$1').trim();
        links[name] = url;
    }
    return links;
}

function get_commits(response) {
    var body = '';
    if (response.statusCode != 200) { 
        console.log("get_commits: " + response.url + " moving on... status:" + response.statusCode);
        console.log("headers: ", response.headers);
        return; 
    };
    if (has(response.headers, 'link')) {
	var links = parse_link_header(response.headers.link);
	if (links["next"] != null) {
	    var t = new Object();
	    t.func = get_commits;
	    t.opts = clone(options);
	    t.opts.path = links["next"].substring(22, links["next"].length);
	    throttle(t);
	    console.log(response.headers.link);
	    console.log("get_commits: " + t.opts.path)
	}
    };
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
            optionsdb.path = "/" + config.db.name + "/" + item.sha;
	        var r = item.url.split('/');
	        doc.org = r[4];
	        doc.repo = r[5];
	        doc.repofullname = r[4] + '/' + r[5];
	        doc.sha = item.sha;
	        doc.login = "unknown";
	        if (item.committer != null) doc.login = item.committer.login;
	        doc.name = item.commit.committer.name;
	        doc.email = item.commit.committer.email;
	        doc.date = item.commit.committer.date;
	        date = new Date();
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
		    console.log("adding commit for author: " + doc.name);
		};
	    }
	    catch (err) {
		    console.log(err);
	    };
        });
    });
};

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
};

function get_repos(response) {
    var body = '';
    if (response.statusCode != 200) { 
        console.log("get_repos: " + response.url + " moving on... status:" + response.statusCode);
        console.log("headers: ", response.headers);
        return; 
    };
    if (has(response.headers, 'link')) {
	var links = parse_link_header(response.headers.link);
	if (links["next"] != null) {
	    var t = new Object();
	    t.func = get_repos;
	    t.opts = clone(options);
	    t.opts.path = links["next"].substring(22, links["next"].length);
	    throttle(t);
	    console.log(response.headers.link);
	    console.log("get_repos: " + t.opts.path);
	}
    };
    response.on('error', function(e) {
        console.error(e);
    });
    response.on('data', function(d) {
        body += d;
    });
    response.on('end', function() {
        var parsed = JSON.parse(body);
        parsed.forEach(function (item) {
	    var t = new Object();
	    t.func = get_commits;
	    var r = item.full_name.split('/');
	    t.opts = clone(options);
            t.opts.path = "/repos/" + r[0] + "/" + r[1] + "/commits?per_page=100";
	    throttle(t);
	    console.log("get_commits: " + t.opts.path);
        });
    });
};



function delete_db() {
  optionsdb.path = "/" + config.db.name;
  optionsdb.method = "DELETE";
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
      console.log("--- DELETE_DB: ", response.statusCode);
      console.log("headers: ", response.headers);
    };
    response.on('--- ERROR: ', function(e) {
      console.error(e);
    });
    return;
  }).end();
}



function create_db() {
  optionsdb.path = "/" + config.db.name;
  optionsdb.method = "PUT";
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
      console.log("--- CREATE_DB: ", response.statusCode);
      console.log("headers: ", response.headers);
    };
    response.on('--- ERROR: ', function(e) {
      console.error(e);
    });
    return;
  }).end();
}


function load_orgs() {
  if (orgs.length >= 1) {
    orgs.forEach(function(item) {
      var t = new Object();
      if((item.type == "org") || (item.type == "user"))  {
      t.func = get_repos;
      org = item.name;
      t.opts = clone(options);
      t.opts.path = "/" + item.type + "s/" + org + "/repos?per_page=100" + token;
      throttle(t);
      console.log("get_repos: " + t.opts.path);
      }
      else if (item.type="repo") {
      t.func = get_commits;
          repo = item.name;	
      t.opts = clone(options);
          t.opts.path = "/repos/" + repo + "/commits?per_page=100" + token;
      throttle(t);
      console.log("get_commits: " + t.opts.path);
      };
    });
  }
}

eventEmitter.once('couch_db_exists', load_orgs);
eventEmitter.once('couch_db_not_exist', create_db);
eventEmitter.once('couch_db_created', load_orgs);
eventEmitter.once('couch_db_deleted', create_db);
eventEmitter.once('couch_ready', load_orgs);

delete_db();
