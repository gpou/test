var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];

  it("should update the user email and phone by prepending 'frozen' to them", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, email: "test@example.com", phone: "+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Users',
      action: 'put_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, email: "frozen+test@example.com", phone: "frozen+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Account',
      action: 'check_account',
      fn: function(params, success, error) {
        error({status: 404});
      }
    });

    utils.runActivity(
      { user_id: 100 },
      mocks,
      function(error, response) {
        assert.equal(response.email, 'frozen+test@example.com');
        assert.equal(response.phone, 'frozen+3333333333');
        done();
      }
    );
  });

  it("should update the user email by prepending 'frozen+froXXX' to it if the frozen email already exists", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, email: "test@example.com", phone: "+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Users',
      action: 'put_user',
      fn: function(params, success, error) {
        if (!/^frozen\+fro[0-9][0-9][0-9]\+test@example.com$/gi.exec(params['user']['email'])) {
          throw("email does not match frozen+froNNN+test@example.com");
        }
        success({status: 200, obj: { id: 100, email: "frozen+fro123+test@example.com", phone: "frozen+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Account',
      action: 'check_account',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 200, email: "frozen+test@example.com", phone: "frozen+3333333333" }});
      }
    });

    utils.runActivity(
      { user_id: 100 },
      mocks,
      function(error, response) {
        assert.equal(response.email, 'frozen+fro123+test@example.com');
        assert.equal(response.phone, 'frozen+3333333333');
        done();
      }
    );
  });

  it("should not call put_user if email and phone already start with 'frozen'", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, email: "frozen+test@example.com", phone: "frozen+3333333333" }});
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
      { user_id: 100 },
      mocks,
      function(error, response) {
        assert.equal(response.email, 'frozen+test@example.com');
        assert.equal(response.phone, 'frozen+3333333333');
        done();
      }
    );
  });

  it("should not update the user email if it already starts with 'frozen'", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, email: "frozen+test@example.com", phone: "+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Users',
      action: 'put_user',
      fn: function(params, success, error) {
        if (params.user.email || params.user.email_verified_at) {
          throw("email is being updated");
        }
        success({status: 200, obj: { id: 100, email: "frozen+test@example.com", phone: "frozen+3333333333" }});
      }
    });

    utils.runActivity(
      { user_id: 100 },
      mocks,
      function(error, response) {
        assert.equal(response.email, 'frozen+test@example.com');
        assert.equal(response.phone, 'frozen+3333333333');
        done();
      }
    );
  });

  it("should not update the user phone if it already starts with 'frozen'", function(done) {
    mocks.push({
      endpoint: 'Users',
      action: 'get_user',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, email: "test@example.com", phone: "frozen+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Users',
      action: 'put_user',
      fn: function(params, success, error) {
        if (params.user.phone|| params.user.phone_verified_at) {
          throw("phone is being updated");
        }
        success({status: 200, obj: { id: 100, email: "frozen+test@example.com", phone: "frozen+3333333333" }});
      }
    });
    mocks.push({
      endpoint: 'Account',
      action: 'check_account',
      fn: function(params, success, error) {
        error({status: 404});
      }
    });

    utils.runActivity(
      { user_id: 100 },
      mocks,
      function(error, response) {
        assert.equal(response.email, 'frozen+test@example.com');
        assert.equal(response.phone, 'frozen+3333333333');
        done();
      }
    );
  });
});
