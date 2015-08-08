var Promise = require('promise')
var PouchDB = require('pouchdb')
var ratingsDB = new PouchDB('ratings_db')
var batch = require('./batch')
var cache = require('./cache')

var jlog = function(x) { console.log(JSON.stringify(x, null, 3)) }

// ratings service
function RatingService() {}
RatingService.prototype = {

    getRatings: function(userId, titleIds) {
        jlog("getRatings(" + userId + ", [" + titleIds + "])")
        
        return ratingsDB.allDocs({
            keys: titleIds.map(function(id) {
                return userId + "," + id;
            }),
            include_docs: true
        }).then(function(dbResponse) {
            var ratings = {}
            dbResponse.rows.forEach(function(row) {
                ratings[row.key.substr((userId + ",").length)] = row
            })
            return ratings
        });
	},
    
    setRatings: function(userId, titlesIdsAndRating) {
        jlog("setRatings(" + userId + ", {" + JSON.stringify(titlesIdsAndRating) + "})")        
		
        function coerce(rating) {
                if (rating > 5)
                	return 5
                else if (rating < 1)
                	return 1
                else
                	return rating
        }

        var ids = Object.keys(titlesIdsAndRating)

        //test:
        // return Promise.resolve({
        //     9: {
        //         doc: {rating: 69}
                
        //     },
        //     10: {
        //         doc: {rating: 69}
        //     }
        // })

        return ratingsDB.allDocs({
            keys: ids.map(function(id) {
                return userId + "," + id;
            }),
            include_docs: true
        }).then(function(getResponse) {
            //jlog(getResponse)
            return ratingsDB.bulkDocs(ids.map(function(id, index) {
                // jlog("=============")
                // jlog(titlesIdsAndRating[id].userRating)
                return {
                    _id: userId + "," + id,
                    _rev: (!getResponse.rows[index].error ? getResponse.rows[index].value.rev : undefined),
                    rating: coerce(titlesIdsAndRating[id].userRating)
                };
            })).then(function(setResponse) {
                var results = {}
                getResponse.rows.forEach(function(response, index) {
                    if (setResponse[index].ok) {
                        if (getResponse.rows[index].error) {
                            results[response.key.substr((userId + ",").length)] = {
                              id: setResponse[index].id,
                              key: setResponse[index].id,
                              value: {
                                 rev: setResponse[index].rev
                              },
                              doc: {
                                 rating: coerce(titlesIdsAndRating[response.key.substr((userId + ",").length)].userRating),
                                 _id: setResponse[index].id,
                                 _rev: setResponse[index].rev
                              }
                           }
                        } else {
                            results[response.key.substr((userId + ",").length)] = response
                        }
                    } else {
                        results[response.key.substr((userId + ",").length)] = setResponse[index]
                    }
                })
                return results
            })
        });	
	}
}

module.exports = new RatingService()

// module.exports.getRatings(1, [3,4,5]).then(jlog, jlog)
// module.exports.getRatings(1, [1,2,3]).then(jlog, jlog)

// //example:
// module.exports.getRatings(1, [11]).then(jlog)
// module.exports.getRatings(1, [11]).then(function(x) {
// 	jlog(x)
// 	module.exports.getRatings(1, [11]).then(jlog)
// 	module.exports.getRatings(1, [11]).then(jlog)
// })
// jlog("-----------------------------------")
