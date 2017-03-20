var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000,
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR WORKFLOW: sendNotification ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      snsTopic: 'arn:aws:sns:us-east-1:836897382102:test-notifications-dispatcher:rate_update',
      vreasyEvent: {
        event: 'rate_update',
        resource_id: 123,
        resource_type: 'listing',
        update_url: 'http://www.vreasy.dev/api/rate-updates?listing_id=123'
      },
      delay: 600
    };
    options = {input:input};
    events = utils.createWorkflowMockEvents("sendNotification", options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start the Timer', function(done) {

      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal("StartTimer", decision.decisionType);

        var decisionAttributes = utils.getDecisionAttributes(decision);
        assert.equal(decisionAttributes.startToFireTimeout, "600");
        assert.equal(decisionAttributes.timerId, 'timer_notify_rate_update_listing_123');

        done();
      });
    });
  });

  describe('--- I have started the workflow ---', function(){
    it('should start the activity when timer is triggered with the input data', function(done) {

      events.push({
        "eventType": "TimerStarted",
        "timerStartedEventAttributes": {
          "timerId": "timer_notify_rate_update_listing_123"
        }
      });

      events.push({
        "eventType": "TimerFired",
        "timerFiredEventAttributes": {
          "timerId": "timer_notify_rate_update_listing_123"
        }
      });

      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal("ScheduleLambdaFunction", decision.decisionType);

        var decisionAttributes = utils.getDecisionAttributes(decision);
        assert.equal("activity_notify_rate_update_listing_123", decisionAttributes.id);

        var input = JSON.parse(decisionAttributes.input);
        assert.equal(
          "arn:aws:sns:us-east-1:836897382102:test-notifications-dispatcher:rate_update",
          input.input.snsTopic
        );
        assert.equal('rate_update', input.input.vreasyEvent.event);

        done();
      });
    });
  });

});
