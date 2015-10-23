/*eslint-env node */
var nano = require('nano')('http://localhost:5984');

var db = nano.db.use('gitstats-a');

db.view('commit_views', 'two_years', {'include_docs': true}, function(select_err, select_body) {
	if(!select_err) {
		var commits = [];
		select_body.rows.forEach(function (item, index) {
//				console.log("doc:" + JSON.stringify(item.doc));
			commits[index] = item.doc;
		});
		console.log(JSON.stringify(commits));
	}
});
