var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: disassociateProviderFromPMs ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted",input:{user_id: 10}};
     events = utils.createWorkflowMockEvents("disassociateProviderFromHosts",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start activity getPMs_1', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getPMs_1");
        done();
      });
    });
  });

  describe('--- I have completed activity getPMs_1 ---', function(){
    beforeEach(function(){
      options = {initialId:1,status:"hasCompleted",result:[40,30]};
      events = events.concat(utils.createLambdaMockEvents("getPMs_1",options));
    })

    it('should decide to schedule activity deactivateProvider for the first host', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getDecisions();
        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "deactivateProvider_40");

        done();
      });
    });

    describe('--- I have completed activity deactivateProvider_40 ---', function(){
      beforeEach(function(){
        options = {initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProvider_40",options));
      })

      it('should decide to schedule activity deactivateProvider for the next host', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "deactivateProvider_30");

          done();
        });
      });
    });

    describe('--- I have run the activity deactivateProvider for all the hosts and all completed ---', function(){
      beforeEach(function(){
        options = {initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProvider_40",options));

        options = {initialId:7,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("deactivateProvider_30",options));
      })

      it('should decide to complete the workflow execution', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "CompleteWorkflowExecution");
          done();
        });
      });

    });
  });
});
