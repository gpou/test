var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should make a call to a vreasy endpoint and return a set of results", function(done) {
    mocks.push({
      endpoint: 'UserStats',
      action: 'get_user_stats',
      fn: function(params, success, error) {
        success({status: 200, obj: {id: 1}});
      }
    });

    utils.runActivity(
      {
        endpoint: 'UserStats',
        action: 'get_user_stats',
        params: {
          fields: 'id',
          limit: 10,
          after: 10
        }
      },
      mocks,
      function(error, response) {
        assert.deepEqual(response, {id: 1});
        done();
      }
    );
  });
});
