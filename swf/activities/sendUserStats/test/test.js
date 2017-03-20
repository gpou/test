var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');
var now;

utils.setEnvironment(activityFunction);

describe('When called on a day different than 1st of month', function(){
  var mocks = [];

  beforeEach(function() {
    now = '2016-02-20 10:00:00';

    mocks.push({
      endpoint: 'UserStats',
      action: 'update_csv',
      fn: function(params, success, error) {
        success({status: 200, obj: {"message":"CSV file succesfully updated"}});
      }
    });
    mocks.push({
      endpoint: 'UserStats',
      action: 'put_user_stats',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 1, user_id: 1699370, sent_at: now, reset_at: '2016-01-01 10:00:00'}});
      }
    });
    mocks.push({
      endpoint: 'UserStats',
      action: 'reset_user_stats',
      fn: function(params, success, error) {
        assert.fail('non expected request to reset_user_stats');
      }
    });
    mocks.push({
      nowMock: now
    });
  });

  it("should update the userStats sent_at but not the reset_at", function(done) {
    utils.runActivity(
      {
        user_stats_id: 1
      },
      mocks,
      function(error, response) {
        assert.equal(response.sent_at, now, 'sent_at incorrect');
        assert.equal(response.reset_at, '2016-01-01 10:00:00', 'reset_at incorrect');
        done();
      }
    );
  });
});

describe('When called on the 1st day of month', function(){
  var mocks = [];

  beforeEach(function() {
    now = '2016-02-01 10:00:00';

    mocks.push({
      endpoint: 'UserStats',
      action: 'update_csv',
      fn: function(params, success, error) {
        success({status: 200, obj: {"message":"CSV file succesfully updated"}});
      }
    });
    mocks.push({
      endpoint: 'UserStats',
      action: 'put_user_stats',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 1, user_id: 1699370, sent_at: now, reset_at: '2016-01-01 10:00:00'}});
      }
    });
    mocks.push({
      endpoint: 'UserStats',
      action: 'reset_user_stats',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 1, user_id: 1699370, sent_at: now, reset_at: now}});
      }
    });
    mocks.push({
      nowMock: now
    });
  });

  it("should update the userStats sent_at and also reset_at", function(done) {
    utils.runActivity(
      {
        user_stats_id: 1
      },
      mocks,
      function(error, response) {
        assert.equal(response.sent_at, now, 'sent_at incorrect');
        assert.equal(response.reset_at, now, 'sent_at incorrect');
        done();
      }
    );
  });
});
