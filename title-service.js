var PouchDB = require('pouchdb')
var titlesDB = new PouchDB('titles_db')
var batch = require('./batch')
var cache = require('./cache')

var jlog = function(x) { console.log(JSON.stringify(x, null, 3)) }

// titles service
function TitleService() {}
TitleService.prototype = {
	getTitles: function(titleIds) {
		jlog("getTitles([" + titleIds + "])")
		
        return titlesDB.allDocs({
            keys: titleIds,
            include_docs: true
        }).then(function(dbResponse) {
			var titles = {}
			dbResponse.rows.forEach(function (row) {
				titles[row.key] = row	
			})
			return titles
		})
	}
}

module.exports = new TitleService()

//example:
// module.exports.getTitles([12]).then(jlog)
// module.exports.getTitles([12]).then(function(x) {
// 	jlog(x)
// 	module.exports.getTitles([13]).then(jlog)
// 	module.exports.getTitles([12,13]).then(jlog)
// })
// jlog("-----------------------------------")
