var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 100, // Set the limit to somethin high to avoid having to test pagination
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR DECIDER OF WORKFLOW: getAllEnquiryAutomations ---', function(){
  var options;
  var events;

  beforeEach(function() {
     options = {isChild:false,initialId:0,status:"notCompleted",input:{user_id: 10, xoauth_requestor_id: 10, limit: 50}};
     events = utils.createWorkflowMockEvents("getAllEnquiryAutomations",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start childworkflow getPageEnquiryAutomations_1', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getPageEnquiryAutomations_1");
        done();
      });
    });
  });

  describe('--- I have completed the first childworkflow getPageEnquiryAutomations ---', function(){
    beforeEach(function(){
      var results = {
        failures: 0,
        failureDetails: [],
        processed: options.input.limit,
      };
      options = {isChild:true,initialId:3,status:"hasCompleted",result:results};
      events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations_1", options));
    })

    it('should decide to schedule a second childworkflow getPageEnquiryAutomations', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getDecisions();
        assert.equal(decisions[0].decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "getPageEnquiryAutomations_2");

        done();
      });
    });
  });

  describe('--- I have completed the first childworkflow getPageEnquiryAutomations and some failed ---', function(){
    beforeEach(function(){
      var results = {
        failures: 1,
        failureDetails: [],
        processed: options.input.limit,
      };
      options = {isChild:true,initialId:3,status:"hasCompleted",result:results};
      events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations_1", options));
    })

    it('should decide to schedule a second childworkflow getPageEnquiryAutomations', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decisions = utils.getDecisions();
        assert.equal(decisions[0].decisionType, "StartChildWorkflowExecution");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "getPageEnquiryAutomations_2");

        done();
      });
    });
  });

  describe('--- I have completed the childworkflow getPageEnquiryAutomations, the processed were less than the limit and there were failures ---', function(){
    beforeEach(function(){
      var results = {
        failures: 1,
        failureDetails: [],
        processed: options.input.limit - 1,
      };
      options = {isChild:true,initialId:3,status:"hasCompleted",result:results};
      events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations_1", options));
    })

    it('should decide to complete the workflow execution', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "FailWorkflowExecution");

        done();
      });
    });
  });

  describe('--- I have completed the childworkflow getPageEnquiryAutomations, the processed were less than the limit and there were NOT failures ---', function(){
    beforeEach(function(){
      var results = {
        failures: 0,
        failureDetails: [],
        processed: options.input.limit - 1,
      };
      options = {isChild:true,initialId:3,status:"hasCompleted",result:results};
      events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations_1", options));
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

  describe('--- I have run the first childworkflow getPageEnquiryAutomations and failed ---', function(){
    beforeEach(function(){
      var results = {
        failures: 0,
        failureDetails: [],
        processed: 0,
      };
      options = {isChild:true,initialId:3,status:"hasFailed"};
      events = events.concat(utils.createWorkflowMockEvents("getPageEnquiryAutomations_1", options));
    })

    it('should decide to fail the workflow', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 1);

        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "FailWorkflowExecution");

        done();
      });
    });
  });
});
