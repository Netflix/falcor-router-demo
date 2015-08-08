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
                $ref('titlesById[523]'),
                $ref('titlesById[829]')
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
var bodyParser = require("body-parser");
var PouchDB = require('pouchdb');
var CookieParser = require('restify-cookies');

var jsonGraph = require('falcor-json-graph');
var $ref = jsonGraph.ref;
var $atom = jsonGraph.atom;
var $error = jsonGraph.error;

var ratingService = require('./rating-service');
var titleService = require('./title-service');
var recommendationService = require('./recommendation-service');

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
            url,
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

var NetflixRouterBase = Router.createClass([   
    {
        route: "titlesById[{integers:titleIds}].userRating",
        get: function(pathSet) {

            return ratingService.getRatings(this.userId, pathSet.titleIds).
                then(function(ratings) {
                    return pathSet.titleIds.map(function(titleId) { 
                        if (!ratings[titleId].error) {                            
                            return {
                                path: ['titlesById', titleId, 'userRating'], 
                                value: ratings[titleId].doc.rating
                            };                            
                        } else if (ratings[titleId].error == "not_found") {
                            return {
                                path: ['titlesById', titleId, 'userRating'],
                                value: jsonGraph.undefined()
                            };    
                        } else {
                            return {
                                path: ['titlesById', titleId],
                                value: $error(ratings[titleId].error)
                            };
                        }
                    });                    
                });
        },
        set: function (jsonGraph) {
    
            if (this.userId === undefined)
                throw new Error("not authorized");

            var ids = Object.keys(jsonGraph.titlesById);                        
            return ratingService.setRatings(this.userId, jsonGraph.titlesById).
                then(function(ratings) { 
                    return ids.map(function(id) {
                        if (!ratings[id].error) {
                            return {
                                path: ['titlesById', id, 'userRating'],
                                value: ratings[id].doc.rating
                            };
                        } else {
                            return {
                                path: ['titlesById', id],
                                value: $error(ratings[id].message) 
                            };
                        }
                    });    
                });
        }
    },
        
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelist: [
    //         {
    //             name: "Thrillers"
    //         },
    //     ]
    // }
    {
        //@TODO: where should the below 'length' property be drawn from?
        //route: "genrelist[{integers:indices}]['name', 'length']",
        route: "genrelist[{integers:indices}]['name', 'notlength']",
        get: function (pathSet) {
                        
            // In this example, the pathSet could be ["genrelist", [0,1,2], "name"].
            // If that were the case, we would need to return a Promise of an
            // Array containing the following PathValues: 
            // {path: ["genreList", 0, "name"], value: "Horror"}
            // {path: ["genreList", 1, "name"], value: "Thrillers"}
            // {path: ["genreList", 2, "name"], value: "New Releases"}
            return recommendationService.getGenreList(this.userId)
                .then(function(genrelist) {
                    // use the indices alias to retrieve the array (equivalent to pathSet[1])             
                    return pathSet.indices.map(function(index) {
                        // If we determine that the index does not exist, we must 
                        // return an atom of undefined. Returning nothing is _not_
                        // an acceptable response. 
                        // Note that we are also specific about what part of the
                        // JSON is null. We clearly respond that the 
                        // list is null or undefined, _not_ the name of the list.
                        var list = genrelist[index],
                            results = [];

                        if (list == null) {
                            return { path: ["genrelist", index], value: $atom(list)};
                        }

                        pathSet[2].forEach(function(key) {
                            results.push({
                                path: ['genrelist', index, key],
                                value: genrelist[index][key]
                            });
                        });
                        return results;
                    }).reduce(function(x, xs) {
                        return x.concat(xs)
                    }, []);
                });
        }
    }, 
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelist: [
    //         {
    //             titles: [
    //                  $ref('titlesById[523]')
    //             ]
    //         }
    //     ]
    // }
    {
        route: "genrelist[{integers:indices}].titles[{integers:titleIndices}]",
        get: function (pathSet) {
            return recommendationService.getGenreList(this.userId).
                then(function(genrelist) {
                   
                    var pathValues = [];
                    pathSet.indices.forEach(function (index) {
                        pathSet.titleIndices.forEach(function(titleIndex) {
                            var titleID = genrelist[index].titles[titleIndex];
                            if (titleID == null) {
                                pathValues.push({ path: ["genrelist", index, "titles", titleIndex], value: $atom(titleID) });
                            }
                            else {
                                pathValues.push({
                                    path: ['genrelist', index, 'titles', titleIndex],
                                    value: $ref(['titlesById', titleID])
                                });
                            }
                        });
                    });
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
        route: "titlesById[{integers:titleIds}]['name','year','description','boxshot','rating']",
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
            return titleService.getTitles(pathSet.titleIds).
                then(function(titles) {
                    var response = {};
                    var jsonGraph = response['jsonGraph'] = {};                    
                    var titlesById = jsonGraph['titlesById'] = {};

                    pathSet.titleIds.forEach(function(titleId) {
                        var responseTitle = titles[titleId],
                            title = {};
                            
                        if (responseTitle.error == "not_found") {
                            titlesById[titleId] = jsonGraph.undefined();
                        } else if (responseTitle.error) {
                            titlesById[titleId] = $error(responseTitle.error);
                        } else {
                            titleKeys.forEach(function(key) {
                                title[key] = responseTitle.doc[key];
                            });
                            titlesById[titleId] = title;
                        }
                    });
                    return response;
                });
            
        }
    },
    {
        route: 'genrelist[{integers:indices}].titles.length',
        get: function(pathSet) {
               
            return recommendationService.getGenreList(this.userId || 'all')
                .then(function(genrelist) {             
                    return pathSet.indices.map(function(index) {
                        var list = genrelist[index];
                        
                        if (list == null) {
                            return { path: ["genrelist", index, 'titles', 'length'], value: $atom(list)};
                        }
                        return {
                            path: ['genrelist', index, 'titles', 'length'],
                            value: list.titles.length
                        }
                    });
                });
        }
    },    
    {
        route: 'genrelist[{integers:indices}].titles.push',
        call: function(callPath, args) {
               
            if (this.userId == undefined)
                throw new Error("not authorized");

            return recommendationService.addTitleToGenreList(this.userId, callPath.indices[0], args[0])
        }
    }
]);

var NetflixRouter = function(userId) {
    NetflixRouterBase.call(this);
    this.userId = userId;
};

NetflixRouter.prototype = Object.create(NetflixRouterBase.prototype);

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
server.use(restify.bodyParser({mapParams: true}));
server.use(CookieParser.parse);


server.on('after', restify.auditLogger({
    log: LOG.child({
        component: 'audit'
    })
}));


server.on('uncaughtException', function (req, res, route, err) {
    req.log.error(err, 'got uncaught exception');
});

server.post('/model.json', falcorPlugin(function (req, res, next) {
    var cookies = req.cookies; // Gets read-only cookies from the request
    //return new NetflixRouter(cookies.userId);
    return new NetflixRouter("1");
}));

server.get('/model.json', falcorPlugin(function (req, res, next) {
    var cookies = req.cookies; // Gets read-only cookies from the request  
    //return new NetflixRouter(cookies.userId);
    return new NetflixRouter("1");
}));

// Make sure to serve the index.html file
server.get(/\/.*/, restify.serveStatic({
  directory: __dirname,
  default: 'index.html'
}));

server.listen(1001, function() {
  var falcor = require("falcor");
  var HttpDataSource = require("falcor-browser");
  var model = new falcor.Model({
      source: new HttpDataSource('http://localhost:1001/model.json')
  });
  
    //examples:
    var log = console.log.bind(console);
    var jlog = function(x) { console.log(JSON.stringify(x, null, 3)); };
      
   // model.get('genrelist[0].name').then(function(x) {
    //    jlog(x)
    //    model.get('genrelist[0].titles[1].name').then(jlog)
   // })


    // model.get('titlesById[26,5,4].userRating').then(function(x) {
    //     model.invalidate('titlesById[26,4,5].userRating')
    //     model.get('titlesById[26,4,5].userRating').then(jlog, jlog)
    //     jlog(x)
    //     //model.get('titlesById[26,4,5,6,7].userRating').then(jlog)        
    // }, jlog)
   
    // model.get('titlesById[3,4,5]["name", "year"]').then(jlog, jlog)
    // model.get('titlesById[5]["year"]').then(function(x) {
    //     jlog(x)
    //     model.get('titlesById[5,3]["description"]').then(jlog)        
    // }, jlog)

    // model.get('titlesById[3,4,5]["name", "year"]').then(jlog, jlog)
    // model.get('titlesById[1,2,3]["name", "year"]').then(jlog, jlog)
    // model.get('titlesById[1,2].name').then(jlog, jlog)
         
    // model.setValue('titlesById[26].userRating', 100).then(function(x) {
    //     jlog(x)
    //     model.get('titlesById[26].userRating').then(jlog, jlog)
    // }, jlog)
       
   // model.get('titlesById[26,4,5].userRating').then(jlog, jlog)
   // model.get('titlesById[26,5].userRating').then(jlog, jlog)

   // model.get('titlesById[1,2,3]["name", "year"]').then(function(x) {
    //    jlog(x)
    //    model.get('titlesById[1,3]["name", "year", "description"]').then(jlog)
    //    //model.get('titlesById[3,4,5]["name", "year"]').then(jlog)
   // })


   //model.get('genrelist[0].titles[0]["name", "rating"]').then(jlog)

   //model.setValue('titlesById[9].userRating', 9).then(jlog, jlog)
   
   //model.get('titlesById[9].userRating').then(jlog, jlog)
   //model.get('titlesById[2].userRating').then(jlog, jlog)

   //test this!!!!!!!!!!!!!!!!!!!!!!:      
   // model.set(jsonGraph.pathValue('titlesById[9].userRating', 9), jsonGraph.pathValue('titlesById[10].userRating', 10)).then(jlog, function(e) {
    //    jlog("onEror:")
    //    jlog(e)
   // })



    //model.get("genrelist[4,5]['name']").then(jlog, jlog)
    
//   model.get("genrelist[4,5]['name', 'length']").then(jlog, jlog) 

//   model.get('genrelist[0].titles.length').then(jlog, jlog)

  // model.call('genrelist[0].titles.push', [{$type: "ref", value: ['titlesById', 1]}], ["name", "rating"], ["length"]).then(function(x) {
    //   jlog(x);
  // }, function(e) {
    //   log("onError:");
    //   jlog(e);
  // });


    //test this too!!!!!!!!!!!!!!!!!!!!!!!!!!!!!:         
  // model.call('genrelist[0].titles.push', [{$type: "ref", value: ['titlesById', 1]}]).then(function(x) {
    // jlog(x)
    // model.get('genrelist[0].titles[44]["name", "year"]').then(jlog, jlog)
  // }, jlog)
  
  console.log('%s listening at %s', server.name, server.url);
});
