var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should get a list of providers", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_owned_providers',
      fn: function(params, success, error) {
        success(({status:200, obj:[{user_id:1}, {user_id:2}, {user_id:3}]}));
      }
    });

    utils.runActivity(
      {
        user_id: 100,
        limit: 10,
        after: 10
      },
      mocks,
      function(error, response) {
        assert.deepEqual(response, [1,2,3]);
        done();
      }
    );
  });
});
