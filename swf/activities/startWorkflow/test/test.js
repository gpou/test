var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should post the workflow", function(done) {
    mocks.push({
      endpoint: 'Workflows',
      action: 'post_workflow',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, status: 'SCHEDULED'}});
      }
    });

    utils.runActivity(
      {
        workflow_name: 'my_workflow'
      },
      mocks,
      function(error, response) {
        done();
      }
    );
  });
});
