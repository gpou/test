var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000, // Set the limit to somethin high to avoid having to test pagination
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: sendPageUserStats ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted"};
     events = utils.createWorkflowMockEvents("sendAllUserStats",options);

     options = {isChild:true,initialId:3,status:"notCompleted"};
     events = events.concat(utils.createWorkflowMockEvents("sendPageUserStats",options));
  });

  describe('--- I have started the childworkflow ---', function(){
    it('should decide to start activity getUserStats', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getUserStats");
        done();
      });
    });
  });

  describe('--- I have completed activity getUserStats ---', function(){
    beforeEach(function(){
      options = {initialId:6,status:"hasCompleted",result:[{id:40,user_id:1},{id:30,user_id:2}]};
      events = events.concat(utils.createLambdaMockEvents("getUserStats",options));
    })

    it('should decide to schedule activity sendUserStats for the first PM', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getDecisions();
        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "sendUserStats_40");

        done();
      });
    });

    describe('--- I have completed activity sendUserStats_40 ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("sendUserStats_40",options));
      })

      it('should decide to schedule activity sendUserStats for the next user stats', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "sendUserStats_30");

          done();
        });
      });
    });

    describe('--- I have run activity sendUserStats_40 and has failed ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("sendUserStats_40",options));
      })

      it('should decide to schedule activity sendUserStats for the next user stats', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "sendUserStats_30");

          done();
        });
      });
    });

    describe('--- I have completed activity all the sendUserStats activities ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("sendUserStats_40",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("sendUserStats_30",options));
      })

      it('should decide to schedule complete childworkflow', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "CompleteWorkflowExecution");
          done();
        });
      });
    });

    describe('--- I have completed activity all the sendUserStats activities and one failed ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("sendUserStats_40",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("sendUserStats_30",options));
      })

      it('should decide to schedule complete childworkflow', function(done) {
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

