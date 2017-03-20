var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should update the property and set deactivated_at to something", function(done) {
    mocks.push({
      endpoint: 'Properties',
      action: 'post_property_deactivate',
      fn: function(params, success, error) {
        console.log("--- test fn called")
        console.log(params)
        console.log(success)
        console.log(error)
        success({status: 200, obj: { id: 100, deactivated_at: "2015-10-10 10:00:00" }});
      }
    });

    utils.runActivity(
      {
        property_id: 100
      },
      mocks,
      function(error, response) {
        console.log("--- test done")
        console.log(error)
        console.log(response)
        assert.ok(response.deactivated_at);
        done();
      }
    );
  });
});
