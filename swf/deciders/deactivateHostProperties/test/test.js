var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 2,
  activityRetries: 2,
  workflowRetries: 2
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: deactivateHostProperties ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted",input:{user_id: 10}};
     events = utils.createWorkflowMockEvents("deactivateHostProperties",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start activity getUserProperties_1', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getUserProperties_1");
        done();
      });
    });
  });

  describe('--- I have completed activity getUserProperties_1 ---', function(){
    beforeEach(function(){
      options = {initialId:1,status:"hasCompleted",result:[40,30]};
      events = events.concat(utils.createLambdaMockEvents("getUserProperties_1",options));
    })

    it('should decide to schedule activity deactivateProperty for the first property', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getDecisions();
        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "deactivateProperty_40");

        done();
      });
    });

    describe('--- deactivateProperty 1 failed one time ---', function(){
      beforeEach(function(){
        options = {initialId:4,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProperty_40",options));
      })

      it('should decide to schedule first retry of activity deactivateProperty for the first property', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decisions = utils.getDecisions();
          assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "deactivateProperty_40_RETRY_1");

          done();
        });
      });

      describe('--- activity deactivateProperty 1 failed a second time ---', function(){
        beforeEach(function(){
          options = {initialId:7,status:"hasFailed"};
          events = events.concat(utils.createLambdaMockEvents("deactivateProperty_40_RETRY_1",options));
        })

        it('should decide to Retry the workflow', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "ContinueAsNewWorkflowExecution");

            var decisionAttributes = utils.getDecisionAttributes(decision);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.options.currentRetry, 1);

            done();
          });
        });
      });
    });

    describe('--- I have completed activity deactivateProperty_1 ---', function(){
      beforeEach(function(){
        options = {initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProperty_40",options));
      })

      it('should decide to schedule activity deactivateProperty for the second property', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decisions = utils.getDecisions();
          assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "deactivateProperty_30");

          done();
        });
      });
    });

    describe('--- I have run the activity deactivateProperty for all the properties and all completed ---', function(){
      beforeEach(function(){
        options = {initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProperty_40",options));

        options = {initialId:7,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProperty_30",options));
      })

      it('should decide to start activity getUserProperties_2', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "getUserProperties_2");
          done();
        });
      });

      describe('--- I have completed activity getUserProperties_2 ---', function(){
        beforeEach(function(){
          options = {initialId:10,status:"hasCompleted",result:[70]};
          events = events.concat(utils.createLambdaMockEvents("getUserProperties_2",options));
        })

        it('should decide to schedule activity deactivateProperty for the first property', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decisions = utils.getDecisions();
            assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
            assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "deactivateProperty_70");

            done();
          });
        });

        describe('--- I have run the activity deactivateProperty for all the properties and all completed ---', function(){
          beforeEach(function(){
            options = {initialId:13,status:"hasCompleted"};
            events = events.concat(utils.createLambdaMockEvents("deactivateProperty_70",options));
          })

          it('should decide to CompleteWorkflowExecution', function(done) {
            utils.runDecider(events, function() {
              var decision = utils.getLastDecision();
              assert.equal(decision.decisionType, "CompleteWorkflowExecution");

              done();
            });
          });
        });
      });
    });
  });
});
