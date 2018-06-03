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

It is intended to be hosted at a single URL (model.json).

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

var Router = require('falcor-router');
var Promise = require('promise');

var jsonGraph = require('falcor-json-graph');
var $ref = jsonGraph.ref;
var $error = jsonGraph.error;

var ratingService = require('./rating-service');
var titleService = require('./title-service');
var recommendationService = require('./recommendation-service');

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
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     titlesById: [
    //         {
    //             userRating: 5,
    //             rating: 1.3
    //         }
    //     ]
    // }
    {
        route: "titlesById[{integers:titleIds}]['userRating', 'rating']",
        get: function(pathSet) {
            var userId = this.userId;

            return ratingService.getRatings(pathSet.titleIds, userId).
                then(function(ratings) {
                    var results = [];
                    
                    pathSet.titleIds.forEach(function(titleId) {
                        pathSet[2].forEach(function(key) {
                            var ratingRecord = ratings[titleId];

                            if (ratingRecord.error) {
                                results.push({
                                    path: ['titlesById', titleId, key],
                                    value: $error(ratingRecord.error)
                                });
                            } else if (ratingRecord.doc) {
                                results.push({
                                    path: ['titlesById', titleId, key], 
                                    value: ratingRecord.doc[key]
                                });
                            } else {
                                results.push({
                                    path: ['titlesById', titleId],
                                    value: undefined
                                });
                            }
                             
                        });
                    });
                    
                    return results;
                });
        }
    },
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     titlesById: [
    //         {
    //             userRating: 5
    //         }
    //     ]
    // }    
    {
        route: "titlesById[{integers:titleIds}].userRating",
        set: function (jsonGraphArg) {
                
            if (this.userId == undefined)
                throw new Error("not authorized");

            var titlesById = jsonGraphArg.titlesById,
                ids = Object.keys(titlesById);
                        
            return ratingService.setRatings(this.userId, titlesById).
                then(function(ratings) {
                    return ids.map(function(id) {
                        if (ratings[id].error) {
                            return {
                                path: ['titlesById', id],
                                value: $error(ratings[id].error) 
                            };
                        } else if (ratings[id].doc) {
                            return {
                                path: ['titlesById', id, 'userRating'],
                                value: ratings[id].doc.userRating
                            };                          
                        } else {
                            return {
                                path: ['titlesById', id],
                                value: undefined 
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
    //         }
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
            return recommendationService.
                getGenreList(this.userId).
                then(function(genrelist) {
                    // use the indices alias to retrieve the array (equivalent to pathSet[1])             
                    return pathSet.indices.map(function(index) {
                        var list = genrelist[index];

                        // If we determine that there is no genre at the index, we must
                        // be specific and return that it is the genre that is not 
                        // present and not the name of the genre.
                        if (list == null) {
                            return { path: ["genrelist", index], value: list };
                        }

                        return {
                            path: ['genrelist', index, 'name'],
                            value: genrelist[index].name
                        };
                    });
                });
        }
    }, 
    // Here's an example subset of the JSON Graph which this route simulates.
    //  {
    //      genrelist: {
    //         myList: $ref('genreList[10]')]
    //      }
    //  }    
    {
        route: "genrelist.myList",
        get: function(pathSet) {
                
            if (this.userId == undefined)
                throw new Error("not authorized");
                    
            return recommendationService.
                getGenreList(this.userId).
                then(function(genrelist) {
                    for (var i = 0, genreListLength = genrelist.length; i < genreListLength; i++) {
                        if (genrelist[i].myList) {
                            return [{
                                path: ['genrelist', 'myList'],
                                value: $ref(['genrelist', i])
                            }];
                        }
                    }
                    throw new Error("myList missing from genrelist");
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
            return recommendationService.
                getGenreList(this.userId).
                then(function(genrelist) {
                    var pathValues = [];
                    pathSet.indices.forEach(function (index) {
                        var genre = genrelist[index];
                        
                        // If we determine that there is no genre at the index, we must
                        // be specific and return that it is the genre that is not 
                        // present and not the name of the genre.
                        if (genre == null) {
                            pathValues.push({
                                path: ['genrelist', index],
                                value: genre
                            });
                        } else {
                            pathSet.titleIndices.forEach(function(titleIndex) {
                                var titleID = genrelist[index].titles[titleIndex];

                                if (titleID == null) {
                                    pathValues.push({ path: ["genrelist", index, "titles", titleIndex], value: titleID });
                                }
                                else {
                                    pathValues.push({
                                        path: ['genrelist', index, 'titles', titleIndex],
                                        value: $ref(['titlesById', titleID])
                                    });
                                }
                            });
                        }
                    });
                    return pathValues;
                });
        }
    }, 
    // This route simulates the following subset of the JSON Graph object.
    // {
    //     titlesById: {
    //         "8": {
    //            "name":"Blitz",
    //            "year":2011,
    //            "description":"With a serial killer on the loose in London, a detective takes on the case while working out his aggression issues with a police-appointed shrink.",
    //            "boxshot":"http://cdn.test.nflximg.net/images/9236/1919236.jpg"
    //         }
    //     }
    // }
    {
        route: "titlesById[{integers:titleIds}]['name','year','description','boxshot']",
        get: function (pathSet) {
            return titleService.getTitles(pathSet.titleIds).
                then(function(titles) {
                    var results = [];
                    
                    pathSet.titleIds.forEach(function(titleId) {
                        pathSet[2].forEach(function(key) {
                            var titleRecord = titles[titleId];

                            if (titleRecord.error) {
                                results.push({
                                    path: ['titlesById', titleId, key],
                                    value: $error(titleRecord.error)
                                });
                            } else if (titleRecord.doc) {
                                results.push({
                                    path: ['titlesById', titleId, key], 
                                    value: titleRecord.doc[key]
                                });
                            } else {
                                results.push({
                                    path: ['titlesById', titleId],
                                    value: undefined
                                });
                            }
                        });
                    });
                    
                    return results;
                });            
        }
    },
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelist: {
    //          length: 26
    //     }
    // }
    {
        route: 'genrelist.length',
        get: function(pathSet) {
            return recommendationService.getGenreList(this.userId)
                .then(function(genrelist) {             
                    return {
                        path: ['genrelist', 'length'],
                        value: genrelist.length
                    };
                });
        }
    },  

    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelist: [
    //         {
    //             titles: {
    //                 length: 5
    //             }
    //         }
    //     ]
    // }
    {
        route: 'genrelist[{integers:indices}].titles.length',
        get: function(pathSet) {               
            return recommendationService.
                getGenreList(this.userId).
                then(function(genrelist) {             
                    return pathSet.indices.map(function(index) {
                        var list = genrelist[index];
                        
                        // If we determine that there is no genre at the index, we must
                        // be specific and return that it is the genre that is not 
                        // present and not the name of the genre.                        
                        if (list == null) {
                            return { path: ["genrelist", index], value: list };
                        }
                        
                        return {
                            path: ['genrelist', index, 'titles', 'length'],
                            value: list.titles.length
                        };
                    });
                });
        }
    },
    
    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelist: [
    //         {
    //             titles: {
    //                 remove: function() {}
    //             }
    //         }
    //     ]
    // }      
    {
        route: 'genrelist[{integers:indices}].titles.remove',
        call: function(callPath, args) {
            
            if (this.userId == undefined)
                throw new Error("not authorized");

            var genreIndex = callPath.indices[0], titleIndex = args[0];

            return recommendationService.
                removeTitleFromGenreListByIndex(this.userId, genreIndex, titleIndex).
                then(function(titleIdAndLength) {
                    return [
                        {
                            path: ['genrelist', genreIndex, 'titles', {from: titleIndex, to: titleIdAndLength.length }],
                            invalidated: true
                        },
                        {
                            path: ['genrelist', genreIndex, 'titles', 'length'],
                            value: titleIdAndLength.length
                        }
                    ];
                });
        }
    },

    // Here's an example subset of the JSON Graph which this route simulates.
    // {
    //     genrelist: [
    //         {
    //             titles: {
    //                 push: function() {}
    //             }
    //         }
    //     ]
    // }
    {
        route: 'genrelist[{integers:indices}].titles.push',
        call: function(callPath, args) {
               
            if (this.userId == undefined)
                throw new Error("not authorized");

            // validating that argument to add to the list is a reference to an item in the titlesById map:
            var titleRef = args[0], titleId, genreIndex = callPath.indices[0];
            if (titleRef == null || titleRef.$type !== "ref" || titleRef.value[0] != "titlesById" || titleRef.value.length !== 2) {
                throw new Error("invalid input");
            }

            // retrieving the title id from the reference path:            
            titleId = titleRef.value[1];
            if (parseInt(titleId, 10).toString() !== titleId.toString())
                throw new Error("invalid input");

            return recommendationService.
                addTitleToGenreList(this.userId, genreIndex, titleId).
                then(function(length) {
                    return [
                        {
                            path: ['genrelist', genreIndex, 'titles', length - 1],
                            value: titleRef
                        },
                        {
                            path: ['genrelist', genreIndex, 'titles', 'length'],
                            value: length
                        }
                    ];
                });
        }
    }
]);


var NetflixRouter = function(userId) {
    NetflixRouterBase.call(this);
    this.userId = userId;
};
NetflixRouter.prototype = Object.create(NetflixRouterBase.prototype);

module.exports = function(userId) {
    return new NetflixRouter(userId);    
};
