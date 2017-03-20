var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  activityRetries: false,
  workflowRetries: false
});

describe('TEST SUITE FOR WORKFLOW: copyPropertyToProperty ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      property_id: 1,
      target_property_id: 2,
      listings_to_copy: [
        {source_listing_id: 3, target_listing_id: 4},
        {source_listing_id: 5, target_listing_id: 6},
        {source_listing_id: 7, target_listing_id: 8}
      ],
      fields: 'title',
      batchSize: 2
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyPropertyToProperty",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule copyPropertyToProperty_1_2 and getWorkflow_4', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 2);
        var decisions = utils.getDecisions();

        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "copyPropertyToProperty_1_2");

        var decisionAttributes = utils.getDecisionAttributes(decisions[0]);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Properties');
        assert.equal(input.input.action, 'copy_property');
        assert.equal(input.input.params.property_id, 1);
        assert.equal(input.input.params.target_listing_id, 2);

        assert.equal(decisions[1].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[1]), "getWorkflow_4");

        var decisionAttributes = utils.getDecisionAttributes(decisions[1]);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyListingToListing');
        assert.equal(input.input.params.resource_id, 3);

        done();
      });
    });

    describe('I have scheduled copyPropertyToProperty_1_2 and completed getWorkflow_4 ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasBeenScheduled"};
        events = events.concat(utils.createLambdaMockEvents("copyPropertyToProperty_1_2",options));
        options = {isChild:false,initialId:4,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_4",options));
      });

      it('should schedule copyListingToListing_3_4', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "copyListingToListing_3_4");
          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.listing_id, 3);
          assert.equal(input.target_listing_id, 4);
          assert.equal(input.vreasy_workflow_id, 10);

          done();
        });
      });
    });

    describe('I have completed copyPropertyToProperty_1_2 and getWorkflow_4 ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasCompleted"};
        events = events.concat(utils.createLambdaMockEvents("copyPropertyToProperty_1_2",options));
        options = {isChild:false,initialId:4,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_4",options));
      });

      it('should schedule copyListingToListing_3_4', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);
          var decision = utils.getLastDecision();

          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "copyListingToListing_3_4");
          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.listing_id, 3);
          assert.equal(input.target_listing_id, 4);
          assert.equal(input.vreasy_workflow_id, 10);

          done();
        });
      });

      describe('I have completed copyListingToListing_3_4 ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:7,status:"hasCompleted"};
          events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_3_4",options));
        });

        it('should schedule getWorkflow_6 and getWorkflow_8', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 2);
            var decisions = utils.getDecisions();

            assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
            assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "getWorkflow_6");

            var decisionAttributes = utils.getDecisionAttributes(decisions[0]);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.input.endpoint, 'Workflows');
            assert.equal(input.input.action, 'get_workflows');
            assert.equal(input.input.params.workflow_name, 'copyListingToListing');
            assert.equal(input.input.params.resource_id, 5);

            assert.equal(decisions[1].decisionType, "ScheduleLambdaFunction");
            assert.equal(utils.getLambdaNameFromDecision(decisions[1]), "getWorkflow_8");

            var decisionAttributes = utils.getDecisionAttributes(decisions[1]);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.input.endpoint, 'Workflows');
            assert.equal(input.input.action, 'get_workflows');
            assert.equal(input.input.params.workflow_name, 'copyListingToListing');
            assert.equal(input.input.params.resource_id, 7);

            done();
          });
        });

        describe('I have completed getWorkflow_6 ---', function(){
          beforeEach(function() {
            options = {isChild:false,initialId:10,status:"hasCompleted",result:[{id: 11}]};
            events = events.concat(utils.createLambdaMockEvents("getWorkflow_6",options));
            options = {isChild:false,initialId:13,status:"hasBeenScheduled"};
            events = events.concat(utils.createLambdaMockEvents("getWorkflow_8",options));
          });

          it('should schedule copyListingToListing_5_6', function(done) {
            utils.runDecider(events, function() {
              assert.equal(utils.getDecisionCount(), 1);
              var decision = utils.getLastDecision();

              assert.equal(decision.decisionType, "StartChildWorkflowExecution");
              assert.equal(utils.getLambdaNameFromDecision(decision), "copyListingToListing_5_6");
              var decisionAttributes = utils.getDecisionAttributes(decision);
              var input = JSON.parse(decisionAttributes.input);
              assert.equal(input.listing_id, 5);
              assert.equal(input.target_listing_id, 6);
              assert.equal(input.vreasy_workflow_id, 11);

              done();
            });
          });
        });

        describe('I have completed getWorkflow_6 and getWorkflow_8 ---', function(){
          beforeEach(function() {
            options = {isChild:false,initialId:10,status:"hasCompleted",result:[{id: 11}]};
            events = events.concat(utils.createLambdaMockEvents("getWorkflow_6",options));
            options = {isChild:false,initialId:13,status:"hasCompleted",result:[{id: 12}]};
            events = events.concat(utils.createLambdaMockEvents("getWorkflow_8",options));
          });

          it('should schedule copyListingToListing_5_6 and copyListingToListing_7_8', function(done) {
            utils.runDecider(events, function() {
              assert.equal(utils.getDecisionCount(), 2);
              var decisions = utils.getDecisions();

              assert.equal(decisions[0].decisionType, "StartChildWorkflowExecution");
              assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "copyListingToListing_5_6");
              var decisionAttributes = utils.getDecisionAttributes(decisions[0]);
              var input = JSON.parse(decisionAttributes.input);
              assert.equal(input.listing_id, 5);
              assert.equal(input.target_listing_id, 6);
              assert.equal(input.vreasy_workflow_id, 11);

              assert.equal(decisions[1].decisionType, "StartChildWorkflowExecution");
              assert.equal(utils.getLambdaNameFromDecision(decisions[1]), "copyListingToListing_7_8");
              var decisionAttributes = utils.getDecisionAttributes(decisions[1]);
              var input = JSON.parse(decisionAttributes.input);
              assert.equal(input.listing_id, 7);
              assert.equal(input.target_listing_id, 8);
              assert.equal(input.vreasy_workflow_id, 12);

              done();
            });
          });

          describe('I have scheduled copyListingToListing_5_6 and failed copyListingToListing_7_8 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:16,status:"hasBeenScheduled"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_5_6",options));
              options = {isChild:true,initialId:19,status:"hasFailed"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_7_8",options));
            });

            it('should wait for copyListingToListing_5_6 to complete', function(done) {
              utils.runDecider(events, function() {
                assert.equal(utils.getDecisionCount(), 0);
                done();
              });
            });

          });

          describe('I have completed copyListingToListing_5_6 and copyListingToListing_7_8 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:16,status:"hasCompleted"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_5_6",options));
              options = {isChild:true,initialId:19,status:"hasCompleted"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_7_8",options));
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

          describe('I have completed copyListingToListing_5_6 and failed copyListingToListing_7_8 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:16,status:"hasCompleted"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_5_6",options));
              options = {isChild:true,initialId:19,status:"hasFailed"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_7_8",options));
            });

            it('should fail workflow execution', function(done) {
              utils.runDecider(events, function() {
                assert.equal(utils.getDecisionCount(), 1);

                var decision = utils.getLastDecision();
                assert.equal(decision.decisionType, "FailWorkflowExecution");
                var decisionAttributes = utils.getDecisionAttributes(decision);
                var details = JSON.parse(decisionAttributes.details);
                assert.equal(details.length, 1);
                assert.equal(details[0].activityId, "copyListingToListing_7_8");

                done();
              });
            });

          });

          describe('I have failed copyListingToListing_5_6 and copyListingToListing_7_8 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:16,status:"hasFailed"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_5_6",options));
              options = {isChild:true,initialId:19,status:"hasFailed"};
              events = events.concat(utils.createWorkflowMockEvents("copyListingToListing_7_8",options));
            });

            it('should fail workflow execution', function(done) {
              utils.runDecider(events, function() {
                assert.equal(utils.getDecisionCount(), 1);

                var decision = utils.getLastDecision();
                assert.equal(decision.decisionType, "FailWorkflowExecution");
                var decisionAttributes = utils.getDecisionAttributes(decision);
                var details = JSON.parse(decisionAttributes.details);
                assert.equal(details.length, 2);
                assert.equal(details[0].activityId, "copyListingToListing_5_6");
                assert.equal(details[1].activityId, "copyListingToListing_7_8");

                done();
              });
            });
          });
        });
      });
    });
  });
});
