var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000, // Set the limit to somethin high to avoid having to test pagination
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: getPageEnquiryAutomations ---', function(){
  var options;
  var events;

  beforeEach(function() {
    options = {isChild:false,initialId:0,status:"notCompleted",input:{xoauth_requestor_id: 10, limit: 50}};
    events = utils.createWorkflowMockEvents("getAllEnquiryAutomations",options);

    options = {isChild:true,initialId:3,status:"notCompleted",input:{xoauth_requestor_id: 10, limit: 50}};
    events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations",options));
  });

  describe('--- I have started the childworkflow ---', function(){
    it('should decide to start activity getEnquiryAutomations', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getEnquiryAutomations");

        done();
      });
    });
  });

  describe('--- I have completed activity getEnquiryAutomations ---', function(){
    beforeEach(function(){
      options = {initialId:6,status:"hasCompleted",result:[{id:40,user_id:1},{id:30,user_id:2}]};
      events = events.concat(utils.createLambdaMockEvents("getEnquiryAutomations",options));
    })

    it('should decide to schedule workflow getAllReservationsEnquiryAutomation for the first enquiry automation', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getLastDecision();
        assert.equal(decisions.decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decisions), "getAllReservationsEnquiryAutomation_40_1");

        done();
      });
    });

    describe('--- I have completed workflow getAllReservationsEnquiryAutomation_40_1 ---', function(){
      beforeEach(function(){
        var results = {
          failures: 0,
          failureDetails: [],
          processed: 49,
        };
        options = {isChild:true,initialId:9,status:"hasCompleted",result:results};
        events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation_40_1",options));
      })

      it('should decide to start activity updateEnquiryAutomation_40', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType,  "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "updateEnquiryAutomation_40");

          done();
        });
      });

      describe('--- I have completed activity updateEnquiryAutomation_40 ---', function(){
        beforeEach(function(){
          options = {initialId:12,status:"hasCompleted"};
          events = events.concat(utils.createLambdaMockEvents("updateEnquiryAutomation_40",options));
        })

        it('should decide to schedule workflow getAllReservationsEnquiryAutomation for the next enquiry automation', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "StartChildWorkflowExecution");
            assert.equal(utils.getLambdaNameFromDecision(decision), "getAllReservationsEnquiryAutomation_30_1");

            done();
          });
        });
      });
    });

    describe('--- I have run workflow getAllReservationsEnquiryAutomation_40 and has failed ---', function(){
      beforeEach(function(){
        var results = {
          failures: 1,
          failureDetails: [],
          processed: 49,
        };
        options = {isChild:true,initialId:9,status:"hasFailed",result:results};
        events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation_40_1",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateEnquiryAutomation_40",options));
      })

      it('should decide to schedule workflow getAllReservationsEnquiryAutomation for the next enquiry automation', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "getAllReservationsEnquiryAutomation_30_1");

          done();
        });
      });
    });

    describe('--- I have completed workflow all the getAllReservationsEnquiryAutomation activities ---', function(){
      beforeEach(function(){
        var results = {
          failures: 0,
          failureDetails: [],
          processed: 49,
        };
        options = {isChild:true,initialId:9,status:"hasCompleted",result:results};
        events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation_40_1",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateEnquiryAutomation_40",options));

        options = {isChild:true,initialId:15,status:"hasCompleted",result:results};
        events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation_30_1",options));

        options = {initialId:18,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateEnquiryAutomation_30",options));
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

    describe('--- I have completed workflow all the getAllReservationsEnquiryAutomation activities and one failed ---', function(){
      beforeEach(function(){
        var results = {
          failures: 1,
          failureDetails: [],
          processed: 49,
        };
        options = {isChild:true,initialId:9,status:"hasFailed",result:results};
        events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation_40_1",options));

        options = {initialId:12,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateEnquiryAutomation_40",options));

        results = {
          failures: 0,
          failureDetails: [],
          processed: 49,
        };
        options = {isChild:true,initialId:15,status:"hasCompleted",result:results};
        events = events.concat(utils.createWorkflowMockEvents("getAllReservationsEnquiryAutomation_30_1",options));

        options = {initialId:18,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("updateEnquiryAutomation_30",options));
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

