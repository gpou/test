var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should get a list of pms", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_pms',
      fn: function(params, success, error) {
        success(({status:200, obj:[{host_id:1}, {host_id:2}, {host_id:3}]}));
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
