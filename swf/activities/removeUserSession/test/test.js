var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should remove the user session", function(done) {
    utils.runActivity(
      {
        user_id: 2967468
      },
      mocks,
      function(error, response) {
        assert.equal(response, "OK");
        done();
      }
    );
  });
});
