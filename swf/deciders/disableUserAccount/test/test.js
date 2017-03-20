var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000,
  activityRetries: 2,
  workflowRetries: false
});

describe('--- TEST SUITE FOR WORKFLOW: disableUserAccount ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted",input:{user_id: 10}};
     events = utils.createWorkflowMockEvents("disableUserAccount",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start 2 lambda functions (removeUserSession and disableUser)', function(done) {

      utils.runDecider(events, function(err) {
        assert.equal(utils.getDecisionCount(), 2);

        var decisions = utils.getDecisions(events, context);
        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "removeUserSession");
        assert.equal(decisions[1].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[1]), "disableUser");

        done();
      });
    });
  });

  describe('--- I have completed disableUser (got a HOST) and removeUserSession activities  ---', function(){

    beforeEach(function() {
      options = {initialId:1,status:"hasCompleted"};
      events = events.concat(utils.createLambdaMockEvents("removeUserSession",options));

      options = {initialId:4,status:"hasCompleted",result:{roles:"host"}};
      events = events.concat(utils.createLambdaMockEvents("disableUser",options));
    });

    it('I should decide to start the child workflow deactivatePrivateProviders', function(done) {

      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        //get decision from decider
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decision), "deactivatePrivateProviders");

        done();
      });
    });

    describe('--- I have run child workflow deactivatePrivateProviders and it has failed ---', function(){
      beforeEach(function() {
        options = {isChild:true,initialId:7,status:"hasFailed"};
        events = events.concat(utils.createWorkflowMockEvents("deactivatePrivateProviders",options));
      });

      it('should schedule a retry for the child workflow deactivatePrivateProviders', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(utils.getLambdaNameFromDecision(decision), "deactivatePrivateProviders_RETRY_1");

          done();
        });
      });
    });

    describe('--- I have run child workflow deactivatePrivateProviders and it has failed 2 times ---', function(){
      beforeEach(function() {
        options = {isChild:true,initialId:7,status:"hasFailed"};
        events = events.concat(utils.createWorkflowMockEvents("deactivatePrivateProviders",options));

        options = {isChild:true,initialId:10,status:"hasFailed"};
        events = events.concat(utils.createWorkflowMockEvents("deactivatePrivateProviders_RETRY_1",options));
      });

      it('should fail the workflow execution', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "FailWorkflowExecution");

          done();
        });
      });
    });

    describe('--- I have completed child workflow deactivatePrivateProviders ---', function(){
      beforeEach(function() {
        options = {isChild:true,initialId:7,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("deactivatePrivateProviders",options));
      });

      it('should start child workflow deactivateHostProperties', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "deactivateHostProperties");

          done();
        });
      });

      describe('--- I have run child workflow deactivateHostProperties and it has failed ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:10,status:"hasFailed"};
          events = events.concat(utils.createWorkflowMockEvents("deactivateHostProperties",options));
        });

        it('should schedule a retry for the child workflow deactivateHostProperties', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(utils.getLambdaNameFromDecision(decision), "deactivateHostProperties_RETRY_1");

            done();
          });
        });
      });

      describe('--- I have run child workflow deactivateHostProperties and it has failed 2 times ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:10,status:"hasFailed"};
          events = events.concat(utils.createWorkflowMockEvents("deactivateHostProperties",options));

          options = {isChild:true,initialId:13,status:"hasFailed"};
          events = events.concat(utils.createWorkflowMockEvents("deactivateHostProperties_RETRY_1",options));
        });

        it('should fail the workflow execution', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "FailWorkflowExecution");

            done();
          });
        });
      });

      describe('--- I have completed child workflow deactivateHostProperties ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:10,status:"hasCompleted"};
          events = events.concat(utils.createWorkflowMockEvents("deactivateHostProperties",options));
        });

        it('should run activity SetActiveFalse', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(utils.getLambdaNameFromDecision(decision), "deactivateUser");

            done();
          });
        });

        describe('--- I have completed activity deactivateUser ---', function(){
          it('should complete workflow execution', function(done) {

            options = {initialId:13,status:"hasCompleted"};
            events = events.concat(utils.createLambdaMockEvents("deactivateUser",options));

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
  });



  describe('--- I have completed disableUser (got a PROVIDER) and removeUserSession activities  ---', function(){

    beforeEach(function() {
      options = {initialId:1,status:"hasCompleted"};
      events = events.concat(utils.createLambdaMockEvents("removeUserSession",options));

      options = {initialId:4,status:"hasCompleted",result:{roles:"provider"}};
      events = events.concat(utils.createLambdaMockEvents("disableUser",options));
    });

    it('as I am a provider, I should decide to start the child workflow disassociateProviderFromPMs', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decision), "disassociateProviderFromPMs");

        done();
      });
    });

    describe('--- I have completed child workflow disassociateProviderFromPMs ---', function(){
      beforeEach(function() {
        options = {isChild:true,initialId:7,status:"hasCompleted"};
        events = events.concat(utils.createWorkflowMockEvents("disassociateProviderFromPMs",options));
      });

      it('should run activity deactivateUser', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "deactivateUser");

          done();
        });
      });

      describe('--- I have completed activity deactivateUser ---', function(){
        it('should complete workflow execution', function(done) {
          options = {initialId:10,status:"hasCompleted"};
          events = events.concat(utils.createLambdaMockEvents("deactivateUser",options));

          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "CompleteWorkflowExecution");

            done();
          });
        });
      });

      describe('--- I have run activity deactivateUser and it has failed ---', function(){
        it('should schedule a retry for deactivateUser', function(done) {

          options = {initialId:10,status:"hasFailed"};
          events = events.concat(utils.createLambdaMockEvents("deactivateUser",options));

          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "ScheduleLambdaFunction");
            assert.equal(utils.getLambdaNameFromDecision(decision), "deactivateUser_RETRY_1");

            done();
          });
        });
      });

      describe('--- I have run activity deactivateUser and it has failed 2 times ---', function(){
        it('should fail workflow execution', function(done) {

          options = {initialId:10,status:"hasFailed"};
          events = events.concat(utils.createLambdaMockEvents("deactivateUser",options));

          options = {initialId:13,status:"hasFailed"};
          events = events.concat(utils.createLambdaMockEvents("deactivateUser_RETRY_1",options));

          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "FailWorkflowExecution");

            done();
          });
        });
      });
    });
  });
});
