var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should read the properties from a user and return an array of ids", function(done) {
    mocks.push({
      endpoint: 'Properties',
      action: 'get_properties',
      fn: function(params, success, error) {
        success({status: 200, obj: [{id: 1}, {id: 2}] });
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
        assert.deepEqual(response, [1,2]);
        done();
      }
    );
  });
});
