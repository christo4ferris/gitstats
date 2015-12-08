gitstats
---------------------

# Overview

<strong>gitstats</strong> reads GitHub data and feeds structured data to an ELK stack (Elasticsearch, Logstash, Kibana).

# Usage
```
node app.js [option]

Options:
        -c, --collect   create a database (if necessary) and collect stats 
                          generated since the last run
        --deletedb      re-create the database and collect stats
        -h, --help      print help (this message)
```
# Environment Setup
<strong>gitstats</strong> requires the middleware listed below:
[NodeJS](https://nodejs.org/) v4.2.1+
[ElasticSearch](https://www.elastic.co/products/elasticsearch) v2.1+
[LogStash](https://www.elastic.co/products/logstash) v2.1+
[Kibana](https://www.elastic.co/products/kibana) v4.3.0+
[npm](https://www.npmjs.com/) v2.14.7+
# Configuration
<strong>gitstats</strong> allows you to use a [personal access token](https://github.com/settings/tokens) 
or a [registered application id/secret](https://github.com/settings/developers).  You only need to provide one
or the other, <strong>gitstats</strong> will use whichever is provided.  If you provide both, it will default to the registered
application credentials.
## Update the configuration file
Make a copy of `config-sample.js` and name it `config.js`.
Open `config.js` in a text editor and update as described below:
```
'orgsfile': './orgs-sample.json',   [point at your org file, see 'Create an org file']
'collect_commits': true,            [true or false]
'collect_pull_requests': true,      [true or false]
'collect_stargazers': true,         [true or false]
'interval': 1000,                   [github processing interval in milliseconds
                                     DO NOT set this value below 720]
'port': 80,                         [gitstats application port]
'host': 'localhost',                [gitstats application host]
'auth': {
    'clientid': '',                 [client id, GitHub registered application]
    'secret': '',                   [client secret, GitHub registered application]
    'token': ''                     [GitHub personal access token]
},
'db': {                             [this section is for NoSQL db]
    'name': 'sample',               [db name]
    'host': 'localhost',            [host]
    'port': 5984                    [port]
    'protocol': 'https:',           [protocol]
    'user': '',                     [username (basic auth)]
    'password': ''                  [password (basic auth)]
},
'git': {
    'hostname': 'api.github.com',
    'port': 443,
    'protocol': 'https:',
    'appid': '',                    [client id, GitHub registered application
                                     use appid & appsecret OR personaltoken, not both
    'appsecret': '',                [client secret, GitHub registered application]
    'personaltoken': ''             [GitHub personal access token]
}

```
## Create an org file
Make a copy of `orgs-sample.json`.  Name it whatever you like, but be sure to
update the `orgsfile` setting in `config.js`.
Open your org file in a text editor, and update it as described below.

<strong>gitstats</strong> is capable of reading stats from GitHub *organizations*, *users*, or *repositories*.
*organizations* and *users* are collections of one or more *repositories*.
<strong>gitstats</strong> will automatically enumerate *organizations* and *users* so
long as you specify the correct `type`, as demonstrated below:
```
[
    {"name":"Open-I-Beam", "type":"org"},
    {"name":"ibm-bioinformatics", "type":"user"},
    {"name":"cognitive-catalyst/cognitive-catalyst", "type":"repo"},
]
```
