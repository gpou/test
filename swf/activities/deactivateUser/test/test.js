var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should update the user and set is_active = false", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, is_active: true }});
      }
    });
    mocks.push({
      endpoint: 'Users',
      action: 'put_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, is_active: false }});
      }
    });

    utils.runActivity(
      {
          user_id: 100
      },
      mocks,
      function(error, response) {
        assert.equal(response.is_active, false);
        done();
      }
    );
  });

  it("should not call put_user if the user is already inactive", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, is_active: false }});
      }
    });
    mocks.push({
      endpoint: 'Users',
      action: 'put_user',
      fn: function(params, success, error) {
        throw("put_user was called");
      }
    });

    utils.runActivity(
      {
          user_id: 100
      },
      mocks,
      function(error, response) {
        assert.equal(response.is_active, false);
        done();
      }
    );
  });
});
