/*eslint-env node */
// Documentation at https://github.com/christo4ferris/gitstats
module.exports = {
    'orgsfile': './orgs-sample.json',
    'collect_commits': true,
    'collect_pull_requests': true,
    'interval': 720,
    'port': 80,
    'host': 'localhost',
    'db': {
        'name': 'sample',
        'host': 'localhost',
        'port': 5984
    },
    'git': {
        'hostname': 'api.github.com',
        'port': 443,
        'protocol': 'https:',
        'appid': '',          // use appid & appsecret OR personaltoken
        'appsecret': '',
        'personaltoken': ''
    }
};
