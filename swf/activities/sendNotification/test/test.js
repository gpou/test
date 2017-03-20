var activityFunction = require('../index.js').activityFunction
    assert = require('assert')
    Logger = require('../lib/logger.js')
    utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  it("should send an sns message to a topic", function(done) {
    var mocks = [];

    mocks.push({
      publishToSns: function (snsTopic, snsSubject, snsMessage, successCallback, errorCallBack) {
        successCallback();
      }
    });

    mocks.push({
      endpoint: 'Listings',
      action: 'put_listing',
      fn: function(params, success, error) {
        success({status: 200, obj: {'rate_updated_at' : '2017-01-01 00:00:00'}});
      }
    });

    utils.runActivity({
      snsTopic: 'arn:aws:sns:us-east-1:836897382102:test-notifications-dispatcher',
      vreasyEvent: {
        event: 'rate_update',
        resource_id: 123,
        resource_type: 'listing',
        update_url: 'http://www.vreasy.dev/api/rate-updates?listing_id=123'
      }
    },
    mocks,
    function(error, response) {
      assert.equal("ok", response);
      done();
    });

  });
});
