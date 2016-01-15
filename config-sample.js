/*eslint-env node */
// Documentation at https://github.com/christo4ferris/gitstats
module.exports = {
    'orgsfile': './orgs-sample.json',
    'collect_commits': true,
    'collect_pull_requests': true,
    'collect_stargazers': true,
    'interval': 1000,
    'port': 80,
    'host': 'localhost',
    'db': {
        'name': 'sample',
        'host': 'localhost',
        'port': 5984,
        'protocol': 'http:',
        'user': '',
        'password': ''
    },
    'git': {
        'hostname': 'api.github.com',
        'port': 443,
        'protocol': 'https:',
        'personaltoken': ''
    },
    'bluemix' : {
        'applicationId'     : '',
        'applicationSecret' : '',
        'applicationRoute'  : '',
        'session'           : ''
    }
};
