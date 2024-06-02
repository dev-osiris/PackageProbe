let curr_dep = {
    qs: '6.11.0',
    depd: '2.0.0',
    etag: '~1.8.1',
    send: '0.18.0',
    vary: '~1.1.2',
    debug: '2.6.9',
    fresh: '0.5.2',
    cookie: '0.6.0',
    accepts: '~1.3.8',
    methods: '~1.1.2',
    'type-is': '~1.6.18',
    parseurl: '~1.3.3',
    statuses: '2.0.1',
    encodeurl: '~1.0.2',
    'proxy-addr': '~2.0.7',
    'body-parser': '1.20.2',
    'escape-html': '~1.0.3',
    'http-errors': '2.0.0',
    'on-finished': '2.4.1',
    'safe-buffer': '5.2.1',
    'utils-merge': '1.0.1',
    'content-type': '~1.0.4',
    finalhandler: '1.2.0',
    'range-parser': '~1.2.1',
    'serve-static': '1.15.0',
    'array-flatten': '1.1.1',
    'path-to-regexp': '0.1.7',
    'cookie-signature': '1.0.6',
    'merge-descriptors': '1.0.1',
    'content-disposition': '0.5.4'
  }
  
  for(let pkg in curr_dep){
    console.log(curr_dep[pkg]);
  }