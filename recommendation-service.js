var Promise = require('promise');
var PouchDB = require('pouchdb');
var recommendationsDB = new PouchDB('recommendations_db');
var batch = require('./batch');

// genrelist service
function RecommendationsService() {}
RecommendationsService.prototype = {
	getGenreList: function(userId) {
        
        var getGenreLists = batch(function(userIds) {
            return recommendationsDB.allDocs({
                keys: userIds.map(function(x) { return x.toString(); }),
                include_docs: true
            }).then(function(dbResponse) {
                var genreLists = {};
                dbResponse.rows.forEach(function(row) {
                    genreLists[row.key] = row;
                });
                return genreLists;
            });            
        });
        
        return getGenreLists([userId || 'all']).then(function(genreLists) {
            return genreLists[userId].doc.recommendations;
        });
	},
    
	addTitleToGenreList: function(userId, genreIndex, titleId) {
        return recommendationsDB.get(userId)
            .then(function(response) {
                var titlesLength = response.recommendations[genreIndex].titles.push(titleId);
                return recommendationsDB.put({
                    _id: userId,
                    _rev: response._rev,
                    recommendations: response.recommendations                     
                }).then(function() {
                    return titlesLength;  
                });
            });
	},
    
    removeTitleFromGenreListByIndex: function(userId, genreIndex, titleIndex) {
        return recommendationsDB.get(userId)
            .then(function(response) {
                var removedTitleId = response.recommendations[genreIndex].titles.splice(titleIndex, 1)[0];
                return recommendationsDB.put({
                    _id: userId,
                    _rev: response._rev,
                    recommendations: response.recommendations
                }).then(function() {
                    return {
                        titleId: removedTitleId, 
                        length: response.recommendations[genreIndex].titles.length
                    }; 
                });
            });
    }    
};

module.exports = new RecommendationsService();
