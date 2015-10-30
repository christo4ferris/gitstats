/*eslint-env node */
// Documentation at https://github.com/christo4ferris/gitstats
module.exports = {
    'orgsfile': './orgs-sample.json',
    'collect_commits': true,
    'collect_pull_requests': true,
    'interval': 720,
    'port': 80,
    'host': 'localhost',
    'auth': {
        'clientid': '',
        'secret': '',
        'token': ''
    },
    'db': {
        'name': 'sample',
        'host': 'localhost',
        'port': 5984
    },
    'es': {
        'host': '127.0.0.1',
        'port': 9200
    }
};
