var Promise = require('promise')

var PouchDB = require('pouchdb')
var recommendationsDB = new PouchDB('recommendations_db')

var log = console.log.bind(console)
var jlog = function(x) { console.log(JSON.stringify(x, null, 3)) }

// genrelist service
function RecommendationsService() {}
RecommendationsService.prototype = {
	getGenreList: function(userId) {
		var self = this
		if (self.cache) {
			return Promise.resolve(self.cache)
		} else {
	        return recommendationsDB.get((userId || 'all').toString())
	            .then(function(response) {
					self.cache = response.recommendations
	                return response.recommendations
	            })
		}
	},
	addTitleToGenreList: function(userId, genreIndex, titles) {
        
        return recommendationsDB.get(userId)
            .then(function(response) {
                var titlesLength = response.recommendations[genreIndex].titles.push(titles);
                return recommendationsDB.put({
                    _id: userId,
                    _rev: response._rev,
                    recommendations: response.recommendations                     
                }).then(function(a) {
                    return [
                        {
                            path: ['genrelist', genreIndex, 'titles', titlesLength - 1],
                            value: titles
                        },
                        {
                            path: ['genrelist', genreIndex, 'titles', 'length'],
                            value: titlesLength
                        }
                    ];
                });
            });		
	},

    //@TODO: untested.
    //[].splice(index, howMany, replce, replce, replce) takes unlimited number of the final argument
    spliceTitleFromGenreList: function(userId, a, b, c) {
        return recommendationsDB.get(userId)
            .then(function(response) {
                var titlesLength = response.recommendations[genreIndex].titles.splice(a, b, c);
                return recommendationsDB.put({
                    _id: userId,
                    _rev: response._rev,
                    recommendations: response.recommendations                     
                }).then(function() {
                    return [
                        {
                            path: ['genrelist', genreIndex, 'titles', titlesLength - 1],
                            value: titles
                        },
                        {
                            path: ['genrelist', genreIndex, 'titles', 'length'],
                            value: titlesLength
                        }
                    ];
                });
            });
    }    
}

module.exports = new RecommendationsService()
