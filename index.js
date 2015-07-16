'use strict';

/*
This example uses the router to build a virtual JSON Graph object on the server 
with the following structure:

{
    genrelist: [
        {
            name: "Thrillers",
            titles: [
                // Reference to title by identifier
                { $type: "ref", value: ["titlesById", 523] },
                { $type: "ref", value: ["titlesById", 829] }
            ]
        }
    ],
    titlesById: {
        523: {
            name: "House of Cards"
        },
        829: {
            name: "Orange is the New Black"
        }
    }
}

It is hosted at a single URL (model.json) using Restify.

********** IMPORTANT ****************

It is only legal to retrieve value types from a JSON Graph 
Object. Therefore to create this virtual JSON Graph object,
_we only need to build routes that match paths along which 
value types are found_. In other words we can create this 
entire virtual JSONGraph object with only three routes.

"genrelist[{integers}].name"
"genrelist[{integers}].titles[{integers}]"
"titlesById[{integers}][{keys}]"

*************************************

As a reminder, the JSON Graph values types are:

1. null
2. string
3. boolean
4. number
5. ref - ex. { $type: "ref", value: ["titlesById", 23]}
6. atom - ex. { $type: "atom", value: 45, $expires: -233}
7. error - ex. { $type: "error", value: "The server is unavailable at the moment." }

*/ 

var bunyan = require('bunyan');
var falcorPlugin = require('falcor-restify');
var restify = require('restify');
var rx = require('rx');
var Router = require('falcor-router');
var Promise = require('promise');

var LOG = bunyan.createLogger({
    name: 'demo',
    level: bunyan.DEBUG,
    src: true
});

// Create a client for retrieving data from backend services
var client = restify.createJsonClient({
    url: 'http://api-global.netflix.com/',
    log: LOG.child({
        component: 'server',
        level: bunyan.INFO,
        serializers: bunyan.stdSerializers
    }),
    version: '*'
});

// Function that returns a backend service responses as Promises
function getJSON(url) {
    return new Promise(function(accept, reject) {
        client.get(
            '/apps/static/sample/genreLists',
            // The client helpfully parses the JSON into obj
            function (err, req, res, obj) {
                if (err) {
                    reject(err);
                }
                else {
                    accept(obj);
                }
            });
    });
}

// A router is a collection of routes, each of which contains operation handlers 
// for the three DataSource operations (get, set, and call).
// Each route matchs a PathSet, and returns either a Promise<JSONGraphEnvelope>
// or a Promise<Array<PathValue>>.

// Routes match PathSets and returns a JSONGraphEnvelope that contains
// the subset of the JSON Graph object which contains all of the values 
// requested in the matched PathSet.

// In other words, if a route matches "genrelist[0..1].name" it could return a
// Promise that resolves to the following JSONGraphEnvelope:
// {
//    jsonGraph: {
//       genrelist: {
//          0: {
//              name: "Horror",
//          },
//          1: {
//              name: "Thrillers"
//          }
//       }
//    }
// }
// Alternately the route could resolve to the following array of PathValues:
// [
//    { path: ["genrelist", 0, "name"], value: "Horror"},
//    { path: ["genrelist", 1, "name"], value: "Thrillers"}
// ]
// When a route returns an array of PathValues, the Router mixes all of the 
// values into a single JSON Graph response anyways, producing the equivalent
// JSONGraphEnvelope.
// [
//    { path: ["genrelist", 0, "name"], value: "Horror"},
//    { path: ["genrelist", 1, "name"], value: "Thrillers"}
// ] ->
// {
//    jsonGraph: {
//       genrelist: {
//          0: {
//              name: "Horror",
//          },
//          1: {
//              name: "Thrillers"
//          }
//       }
//    }
// }
// The Router's eventual response is a JSONGraphEnvelope with the superset of
// all of the individual route JSONGraphEnvelope responses.

//convert...
function pathValuesTOJSONGraphEvelope(pathValues) {
    var jsonGraph = {}
    pathValues.forEach(function(pathValue) {
        var path = pathValue.path
        var value = pathValue.value
        var node = jsonGraph
        var parent = jsonGraph
        path.slice(0, -1).forEach(function(key) {
            node = node[key]
            if (node == null || typeof node !== "object") {
                node = parent[key] = {}
            }
            parent = node
        })
        node[path[path.length - 1]] = value
    })
    return {
        jsonGraph: jsonGraph
    }
}

var router = new Router([
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelists: [
    //         {
    //             name: "Thrillers"
    //         },
    //     ]
    // }
    {
        route: "genrelist[{integers:indices}].name",
        get: function (pathSet) {        
            // In this example, the pathSet could be ["genrelist", [0,1,2], "name"].
            // If that were the case, we would need to return a Promise of an
            // Array containing the following PathValues: 
            // {path: ["genreList", 0, "name"], value: "Horror"}
            // {path: ["genreList", 1, "name"], value: "Thrillers"}
            // {path: ["genreList", 2, "name"], value: "New Releases"}
            return getJSON('/apps/static/sample/genreLists')
                .then(function(genrelist) {       
                    // use the indices alias to retrieve the array (equivalent to pathSet[1])             
                    return pathSet.indices.map(function(index) {
                        // If we determine that the index does not exist, we must 
                        // return an atom of undefined. Returning nothing is _not_
                        // an acceptable response. 
                        // Note that we are also specific about what part of the
                        // JSON is null. We clearly respond that the 
                        // list is null or undefined, _not_ the name of the list.
                        var list = genrelist[index];
                        if (list == null) {
                            return { path: ["genrelist", index], value: {$type:"atom", value: list}};
                        }
                        return {
                            path: ['genrelist', index, 'name'],
                            value: genrelist[index].name
                        }
                    });
                });
        }
    }, 
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelists: [
    //         {
    //             titles: [
    //                 { $type: 'ref', value: ["titlesById", 523] }
    //             ]
    //         }
    //     ]
    // }
    {
        route: "genrelist[{integers:indices}].titles[{integers:titleIndices}]",
        get: function (pathSet) {                        
            return getJSON('/apps/static/sample/genreLists').
                then(function(genrelist) {
                    var pathValues = [];
                    pathSet.indices.forEach(function (index) {
                        pathSet.titleIndices.forEach(function(titleIndex) {
                            var title = genrelist[index].titles[titleIndex];
                            if (title == null) {
                                pathValues.push({ path: ["genrelist", index, "titles", titleIndex], value: { $type: "atom", value: title } });
                            }
                            else {
                                pathValues.push({
                                    path: ['genrelist', index, 'titles', titleIndex],
                                    value: {
                                        $type: 'ref',
                                        value: ['titlesById', title.id]
                                    }
                                });
                            }
                        });
                    });

                    //return pathValuesTOJSONGraphEvelope(pathValues);
                    return pathValues;
                });
        }
    }, 
    // This route simulates the following subset of the JSON Graph object.
    // {
    //     titlesById: {
    //         [{integers}]: {
    //            "title":"Blitz",
    //            "year":2011,
    //            "description":"With a serial killer on the loose in London, a detective takes on the case while working out his aggression issues with a police-appointed shrink.",
    //            "rating":1.7,
    //            "boxshot":"http://cdn.test.nflximg.net/images/9236/1919236.jpg"
    //         }
    //     }
    // }
    // Unlike the other routes which return a Promise<Array<PathValue>>, this route returns a 
    // Promise<JSONGraphEnvelope>.
    {
        route: "titlesById[{integers:titleIds}]['title','year','description','rating','boxshot']",
        get: function (pathSet) {
            // Unlike the other routes which return Promise<Array<PathValue>>, this route will 
            // return a Promise<JSONGraphEnvelope>.
            // For example if the matched pathSet is ["titlesById", [923,619], "year", "rating"], 
            // the JSONGraph response from the route handler might look like this:
            // {
            //    jsonGraph: {
            //        titlesById: {
            //            923: {
            //                "year": 2001,
            //                "rating": 5
            //            },
            //            619: {
            //                "year": 2013,
            //                "rating": 3
            //            }            
            //        }
            //    }
            // }
                        
            var titleKeys = pathSet[2];
            return getJSON('/apps/static/sample/titles?ids=' + pathSet.titleIds.join(',')).
                then(function(titlesList) {
                    var titlesById = {};
                    pathSet.titleIds.forEach(function(titleId, index) {
                        var responseTitle = titlesList[index],
                            title = {},
                            value;

                        if (responseTitle == null) {
                            titlesById[titleId] = { $type: "atom", value: responseTitle};
                        }
                        else {
                            titleKeys.forEach(function(key) {
                                title[key] = responseTitle[key]
                            });
                            titlesById[titleId] = title;
                        }
                    });

                    // Returning a Promise<JSONGraphEnvelope>
                    return { jsonGraph: titlesById };
                });
        }
    }
]);

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

// Expose the
server.get('/model.json', falcorPlugin(function (req, res, next) {
    return router;
}));

// Make sure to serve the index.html file
server.get(/\/.*/, restify.serveStatic({
  directory: __dirname,
  default: 'index.html'
}));

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});
