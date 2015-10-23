/*eslint-env node */
var nano = require('nano')('http://localhost:5984');

var db = nano.db.use('gitstats-a');

db.view('commit_views', 'name_by_month', {'include_docs': false, 'group': true}, function(select_err, select_body) {
	if(!select_err) {
		var commits = [];
		select_body.rows.forEach(function (item, index) {
//				console.log("doc:" + JSON.stringify(item.doc));
			var row = {};
			row.name = item.key.name;	
			row.org = item.key.org;	
			row.repo = item.key.repo;	
			row.year = item.key.year;	
			row.month = item.key.month;	
			row.ibm = item.key.ibm;	
			row.commits = item.value;	
			commits[index] = row;
		});
		console.log(JSON.stringify(commits));
	}
});
