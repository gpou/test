var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000, // Set the limit to somethin high to avoid having to test pagination
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: getAllReservationsEnquiryAutomation ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted"};
     events = utils.createWorkflowMockEvents("getAllEnquiryAutomations",options);

     options = {isChild:true,initialId:1,status:"notCompleted"};
     events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations",options));

     options = {isChild:true,initialId:3,status:"notCompleted"};
     events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation",options));
  });

  describe('--- I have started the childworkflow ---', function(){
    it('should decide to start activity getReservationsEnquiryAutomation', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getReservationsEnquiryAutomation");
        done();
      });
    });
  });

  describe('--- I have completed activity getReservationsEnquiryAutomation ---', function(){
    beforeEach(function(){
      options = {initialId:6,status:"hasCompleted",result:[{id:40},{id:30}]};
      events = events.concat(utils.createLambdaMockEvents("getReservationsEnquiryAutomation",options));
    })

    it('should decide to schedule activity updateReservation for the first reservation', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getDecisions();
        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "updateReservation_40");

        done();
      });
    });

    describe('--- I have completed activity updateReservation_40 ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateReservation_40",options));
      })

      it('should decide to schedule activity updateReservation for the next reservation', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "updateReservation_30");

          done();
        });
      });
    });

    describe('--- I have run activity updateReservation_40 and has failed ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("updateReservation_40",options));
      })

      it('should decide to schedule activity updateReservation for the next reservation', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "updateReservation_30");

          done();
        });
      });
    });

    describe('--- I have completed all the updateReservation activities ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateReservation_40",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateReservation_30",options));
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

    describe('--- I have completed activity all the updateReservation activities and one failed ---', function(){
      beforeEach(function(){
        options = {initialId:9,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("updateReservation_40",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateReservation_30",options));
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

