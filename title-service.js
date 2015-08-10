var PouchDB = require('pouchdb');
var batch = require('./batch')
var path = require('path');
var titlesDB = new PouchDB(path.join(__dirname, 'titles_db'));

// titles service
function TitleService() {}
TitleService.prototype = {
	getTitles: batch(function(titleIds) {
        return titlesDB.allDocs({
            keys: titleIds.map(function(x) { return x.toString(); }),
            include_docs: true
        }).then(function(dbResponse) {
			var titles = {};
			dbResponse.rows.forEach(function (row) {
				titles[row.key] = row;	
			});
			return titles;
		});
	})
};

module.exports = new TitleService();
