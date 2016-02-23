/*eslint-env node */
// Documentation at https://github.com/christo4ferris/gitstats
module.exports = {
    'orgsfile': './orgs-sample.json',
    'collect_commits': true,
    'collect_pull_requests': true,
    'collect_stargazers': true,
    // anything faster than 1000ms may cause GitHub to flag your
    // account for rate-limit violations
    'interval_git': 1000,
    // interval_db is service dependent; for Cloudant, anything
    // faster than 100ms will cause request timeouts.
    'interval_db': 100,
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
    }
};
