var Promise = require('promise');

//fun = [1,2,3] -> Promise({1: {}, 2: {}, 3: {}})
module.exports = function cache(fun) {
	var cache = {};

	return function(ids) {

		var assemble = function(results) {
			//put new results in cache:
			Object.keys(results).forEach(function(id) {
				cache[id] = results[id];
			});
			//grab cached results:
			ids.forEach(function(id) {
				results[id] = cache[id];
			});

			return results;
		};

		var culledIds = ids.filter(function(id) {
			return !cache[id];
		});
		
		if (culledIds.length) {			
			return fun(culledIds).then(assemble);
		} else {
			return Promise.resolve(assemble({}));
		}
	};
};
