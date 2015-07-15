'use strict';

var bunyan = require('bunyan');
var falcorPlugin = require('falcor-restify');
var restify = require('restify');
var rx = require('rx');
var Router = require('falcor-router');

var LOG = bunyan.createLogger({
    name: 'demo',
    level: bunyan.DEBUG,
    src: true
});

var client = restify.createJsonClient({
    url: 'http://api-global.netflix.com/',
    log: LOG.child({
        component: 'server',
        level: bunyan.INFO,
        serializers: bunyan.stdSerializers
    }),
    version: '*'
});

var router = new Router([{
    route: "genrelist[{integers:indices}].name",
    get: function (pathSet) {
        return rx.Observable.create(function subscribe(observer) {
            var subscribed = true;

            client.get('/apps/static/sample/genreLists',
                       function (err, req, res, obj) {
                if (!subscribed) {
                    return;
                }
                if (err) {
                    observer.onError(err);
                } else {
                    observer.onNext(obj);
                    observer.onCompleted();
                }
            });

            return function dispose() {
                subscribed = false;
            };
        }).flatMap(function (genrelist) {
            return rx.Observable.
                fromArray(pathSet.indices).
                map(function (index) {
                    return {
                        path: ['genrelist', index, 'name'],
                        value: genrelist[index].name
                    }
            });
        });
    }
}, {
    route: "genrelist[{integers:indices}].titles[{integers:titleIndices}]",
    get: function (pathSet) {
        return rx.Observable.create(function subscribe(observer) {
            var subscribed = true;

            client.get('/apps/static/sample/genreLists',
                       function (err, req, res, obj) {
                if (err) {
                    req.log.error({err: err});
                    observer.onError(err);
                } else if (!subscribed) {
                    return;
                } else {
                    observer.onNext(obj);
                    observer.onCompleted();
                }
            });

            return function dispose() {
                subscribed = false;
            };
        }).flatMap(function (genrelist) {
            return rx.Observable.
                fromArray(pathSet.indices).
                flatMap(function (index) {
                    return rx.Observable.
                        fromArray(pathSet.titleIndices).
                        map(function (titleIndex) {
                            var title = genrelist[index].titles[titleIndex];
                            if (!title) {
                                return { path: ["genrelist", index, "titles", titleIndex], value: { $type: "atom" } };
                            }
                            return {
                                path: ['genrelist', index, 'titles', titleIndex],
                                value: {
                                    $type: 'ref',
                                    value: ['titlesById', genrelist[index].titles[titleIndex].id]
                                }
                            }
                        })
                });
        });
    }
}, {
    route: "titlesById[{integers:titleIds}].name",
    get: function (pathSet) {
        return rx.Observable.create(function subscribe(observer) {
            var subscribed = true;

            client.get('/apps/static/sample/titles?ids=' + pathSet.titleIds.join(','),
                       function (err, req, res, obj) {
                if (!subscribed) {
                    return;
                }
                if (err) {
                    observer.onError(err);
                } else {
                    observer.onNext(obj);
                    observer.onCompleted();
                }
            });

            return function dispose() {
                subscribed = false;
            };
        }).flatMap(function (titlesList) {
            return rx.Observable.
                fromArray(pathSet.titleIds).
                map(function (titleId, index) {
                    return {
                        path: ['titlesById', titleId, 'name'],
                        value: titlesList[index].title
                    }
            })
        });
    }
}]);

var server = restify.createServer({
    log: LOG.child({
        component: 'server',
        level: bunyan.INFO,
        streams: [{
            // This ensures that if we get a WARN or above all debug records
            // related to that request are spewed to stderr - makes it nice
            // filter out debug messages in prod, but still dump on user
            // errors so you can debug problems
            level: bunyan.DEBUG,
            type: 'raw',
            stream: new restify.bunyan.RequestCaptureStream({
                level: bunyan.WARN,
                maxRecords: 100,
                maxRequestIds: 1000,
                stream: process.stderr
            })
        }],
        serializers: bunyan.stdSerializers
    })
});

server.use(restify.requestLogger());
server.use(restify.queryParser());

server.on('after', restify.auditLogger({
    log: LOG.child({
        component: 'audit'
    })
}));


server.on('uncaughtException', function (req, res, route, err) {
    req.log.error(err, 'got uncaught exception');
});

server.get('/model.json', falcorPlugin(function (req, res, next) {
    return router;
}));

server.get(/\/.*/, restify.serveStatic({
  directory: __dirname,
  default: 'index.html'
}));

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});
