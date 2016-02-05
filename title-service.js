var PouchDB = require('pouchdb');
var batch = require('./batch');
var path = require('path');
var titlesDB = new PouchDB(path.join(__dirname, 'titles_db'));

// titles service
module.exports = {
	getTitles: batch(function(titleIds) {
        return titlesDB.allDocs({
            keys: titleIds.map(function(x) { return x.toString(); }),
            include_docs: true
        }).then(function(dbResponse) {
			var titles = {};
			dbResponse.rows.forEach(function (row) {
				if (row.error) {
					if (row.error == "not_found") {
						titles[row.key] = {doc: null};
					} else {
						titles[row.key] = {error: row.error};
					}
				} else if (row.doc) {
					titles[row.key] = row;
				} else {
					titles[row.key] = {doc: null};
				}
			});
			return titles;
		});
	})
};
