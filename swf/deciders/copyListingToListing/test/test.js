var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  activityRetries: false,
  workflowRetries: false
});

describe('TEST SUITE FOR WORKFLOW: copyListingToListing ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      listing_id: 1,
      target_listing_id: 2,
      fields: 'title'
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyListingToListing",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow', function(done) {
      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyListing');
        assert.equal(input.input.params.resource_id, 2);

        done();
      });
    });

    describe('I have completed getWorkflow ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow",options));
      });

      it('should schedule child workflow copyListing_1_2', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "copyListing_1_2");
          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.listing_id, 1);
          assert.equal(input.target_listing_id, 2);
          assert.equal(input.vreasy_workflow_id, 10);

          done();
        });
      });

      describe('I have completed copyListing_1_2 ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:4,status:"hasCompleted"};
          events = events.concat(utils.createWorkflowMockEvents("copyListing_1_2",options));
        });

        it('should complete workflow execution', function(done) {
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

describe('TEST SUITE FOR WORKFLOW: copyListingToListing with failures in getWorkflow ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      listing_id: 1,
      target_listing_id: 2,
      fields: 'title'
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyListingToListing",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow', function(done) {
      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyListing');
        assert.equal(input.input.params.resource_id, 2);

        done();
      });
    });

    describe('Activity getWorkflow failed ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow",options));
      });

      it('should fail workflow execution', function(done) {
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

describe('TEST SUITE FOR WORKFLOW: copyListingToListing with failures in copyListing ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      listing_id: 1,
      target_listing_id: 2,
      fields: 'title'
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyListingToListing",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow', function(done) {
      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyListing');
        assert.equal(input.input.params.resource_id, 2);

        done();
      });
    });

    describe('I have completed getWorkflow ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow",options));
      });

      it('should schedule child workflow copyListing_1_2', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "copyListing_1_2");
          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.listing_id, 1);
          assert.equal(input.target_listing_id, 2);
          assert.equal(input.vreasy_workflow_id, 10);

          done();
        });
      });

      describe('Child workflow copyListing_1_2 has failed ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:4,status:"hasFailed"};
          events = events.concat(utils.createWorkflowMockEvents("copyListing_1_2",options));
        });

        it('should fail workflow execution', function(done) {
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
