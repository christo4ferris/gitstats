var https = require('https');
var http = require('http');
var orgs = require('./orgs.json');
var config = require('./config.js');

var org = "christo4ferris";
var repo = "dwostats";
var stack = []; 
var timer = null;

var agent;
var token;

var optionsdb = {
  hostname: '127.0.0.1',
  path: 'foo',
  port: 5984,
  method: 'PUT'
};

var a = new http.Agent({ keepAlive: true });
optionsdb.agent = a;

var options = {
  hostname: 'api.github.com',
  port: 443,
  method: 'GET'
};

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
        timer = setInterval(process, 5000);
    };
};

function get_commits(response) {
    var body = '';
    if (response.statusCode != 200) { 
        console.log("get_commits: " + response.url + " moving on... status:" + response.statusCode);
        console.log("headers: ", response.headers);
        return; 
    };
    //console.log("get_commits statusCode: ", response.statusCode);
    if (has(response.headers, 'link')) {
	var t = new Object();
	t.func = get_commits;
	var link = response.headers.link;
	options.path = link.substring(23, link.indexOf('>'));
	console.log("process repo: " + options.path);
	t.opts = clone(options);
	throttle(t);
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
                optionsdb.path = "/gitstats-a/" + item.sha;
	        var r = item.url.split('/');
	        doc.org = r[4];
	        doc.repo = r[5];
	        doc.repofullname = r[4] + '/' + r[5];
	        doc.sha = item.sha;
	        doc.login = "unknown";
	        if (item.committer != null) doc.login = item.committer.login;
	        if (has(item.commit), 'committer') {
	            doc.name = item.commit.committer.name;
	            doc.email = item.commit.committer.email;
	            doc.date = item.commit.committer.date;
	        }
	        else {
	            doc.name = item.commit.author.name;
	            doc.email = item.commit.author.email;
	            doc.date = item.commit.author.date;
	        };
	        date = new Date();
	        date.setDate(doc.date);
	        doc.week = date.getWeekNo();
	        doc.url = item.url;
	    //console.log(JSON.stringify(doc));
	        var db = http.request(optionsdb, insertdb);
	        db.write(JSON.stringify(doc));
	        db.end();
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
	var t = new Object();
	t.func = get_commits;
	var link = response.headers.link;
	options.path = link.substring(23, link.indexOf('>'));
	console.log(response.headers.link);
	console.log("process repo: " + options.path);
	t.opts = clone(options);
	throttle(t);
    };
    response.on('error', function(e) {
        console.error(e);
    });
    response.on('data', function(d) {
        body += d;
    });
    response.on('end', function() {
	var t = new Object();
	t.func = get_commits;
        var parsed = JSON.parse(body);
        parsed.forEach(function (item) {
	    var r = item.full_name.split('/');
            options.path = "/repos/" + r[0] + "/" + r[1] + "/commits?per_page=100";
	    //console.log("get commits: " + options.path);
	    t.opts = clone(options);
	    throttle(t);
        });
    });
};

if (orgs.length >= 1) {
    options.headers = {};
    options.headers.Authorization = new String("token " + config.auth.secret);
    options.headers["User-Agent"] = config.auth.clientid;

    orgs.forEach(function(item) {
	var t = new Object();
        if(item.type == "org") {
	    t.func = get_repos;
    	    org = item.name;
	    options.path = "/orgs/" + org + "/repos?per_page=100";
	    //console.log("process org: " + options.path);
	    t.opts = clone(options);
	    throttle(t);
        }
        else if (item.type="repo") {
	    t.func = get_commits;
            repo = item.name;	
            options.path = "/repos/" + repo + "/commits?per_page=100";
	    //console.log("process repo: " + options.path);
	    t.opts = clone(options);
	    throttle(t);
        };
    });
};
