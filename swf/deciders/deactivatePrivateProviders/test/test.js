var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: deactivatePrivateProviders ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted",input:{user_id: 10}};
     events = utils.createWorkflowMockEvents("deactivatePrivateProviders",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start activity getUserProviders_1', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        //get decision from decider
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getUserProviders_1");

        done();
      });
    });
  });

  describe('--- I have completed getUserProviders ---', function(){
    var input;

    beforeEach(function(){
      options = {initialId:1,status:"hasCompleted",result:[40,30,60]};
      events = events.concat(utils.createLambdaMockEvents("getUserProviders_1", options));
    })

    it('should decide to start the child workflow disableUserAccount for the first user', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        //get decision from decider
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decision), "disableUserAccount_40");

        done();
      });
    });

    describe('--- I have run child workflow disableUserAccount for the first user ID (and has completed, with no results) ---', function(){
      it('should decide to start the child workflow disableUserAccount for the next user', function(done) {

        options = {isChild:true,initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("disableUserAccount_40", options));

        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          //get decision from decider
          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "disableUserAccount_30");

          done();
        });
      });
    });

    describe('--- I have run disableUserAccount for the 1st and 2nd users. In the one of the 2nd it has failed. ---', function(){
      it('should decide to fail the workflow execution', function(done) {

        options = {isChild:true,initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("disableUserAccount_40",options));

        options = {isChild:true,initialId:7,status:"hasFailed"};
        events = events.concat(utils.createWorkflowMockEvents("disableUserAccount_30", options));

        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "FailWorkflowExecution");

          done();
        });
      });
    });

    describe('--- I have completed all the child workflows ---', function(){
      it('should decide to CompleteWorkflowExecution', function(done) {

        options = {isChild:true,initialId:4,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("disableUserAccount_40",options));

        options = {isChild:true,initialId:7,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("disableUserAccount_30", options));

        options = {isChild:true,initialId:10,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("disableUserAccount_60", options));

        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "CompleteWorkflowExecution");

          done();
        });
      });
    });
  })
});
