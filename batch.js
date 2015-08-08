var Promise = require('promise');

//fun = [1,2,3] -> Promise({1: {}, 2: {}, 3: {}})
module.exports = function batch(fun) {
	var batches = {};
	var result = null;

	return function(ids) {
		
		if (!Object.keys(batches).length) {	
			result = 
				Promise.
					resolve().
					then(function() {
						var keys = Object.keys(batches);
						batches = {};
						return fun(keys);
					});
		}
		ids.forEach(function(id) {
			batches[id] = true;
		});
		
		return result.then(function(results) {
			var prunedResults = {};
			ids.forEach(function(id) {
				prunedResults[id] = results[id];
			});
			return prunedResults;
		});
	};
};
