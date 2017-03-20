var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should deactivate provider with given user_id for the PM with the given host_id", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'post_deactivate_provider',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, deactivated_at: "2015-10-10 10:00:00" }});
      }
    });

    utils.runActivity(
      {
          user_id: 100,
          host_id: 101
      },
      mocks,
      function(error, response) {
        assert.ok(response.deactivated_at);
        done();
      }
    );
  });
});
