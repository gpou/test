var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  activityRetries: false,
  workflowRetries: false
});

describe('TEST SUITE FOR WORKFLOW: copyListingToListings ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      listing_id: 1,
      target_listing_ids: [2, 3, 4],
      fields: 'title',
      batchSize: 2
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyListingToListings",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow_2 and getWorkflow_3', function(done) {
      utils.runDecider(events, function() {
        assert.equal(utils.getDecisionCount(), 2);

        var decisions = utils.getDecisions();

        assert.equal(decisions[0].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[0]), "getWorkflow_2");

        var decisionAttributes = utils.getDecisionAttributes(decisions[0]);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyListing');
        assert.equal(input.input.params.resource_id, 2);

        assert.equal(decisions[1].decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decisions[1]), "getWorkflow_3");

        var decisionAttributes = utils.getDecisionAttributes(decisions[1]);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyListing');
        assert.equal(input.input.params.resource_id, 3);

        done();
      });
    });

    describe('I have completed getWorkflow_2 ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_2",options));
        options = {isChild:false,initialId:4,status:"hasBeenScheduled",result:[{id: 11}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_3",options));
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

      describe('I have completed getWorkflow_3 ---', function(){
        beforeEach(function() {
          options = {isChild:false,initialId:4,status:"hasCompleted",result:[{id: 11}]};
          events = events.concat(utils.createLambdaMockEvents("getWorkflow_3",options));
          options = {isChild:true,initialId:7,status:"hasBeenScheduled"};
          events = events.concat(utils.createWorkflowMockEvents("copyListing_1_2",options));
        });

        it('should schedule child workflow copyListing_1_3', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "StartChildWorkflowExecution");
            assert.equal(utils.getLambdaNameFromDecision(decision), "copyListing_1_3");
            var decisionAttributes = utils.getDecisionAttributes(decision);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.listing_id, 1);
            assert.equal(input.target_listing_id, 3);
            assert.equal(input.vreasy_workflow_id, 11);

            done();
          });
        });

        describe('I have completed copyListing_1_2 ---', function(){
          beforeEach(function() {
            options = {isChild:true,initialId:7,status:"hasCompleted"};
            events = events.concat(utils.createWorkflowMockEvents("copyListing_1_2",options));
            options = {isChild:true,initialId:10,status:"hasBeenScheduled"};
            events = events.concat(utils.createWorkflowMockEvents("copyListing_1_3",options));
          });

          it('should wait for copyListing_1_3 to complete', function(done) {
            utils.runDecider(events, function() {
              assert.equal(utils.getDecisionCount(), 0);
              done();
            });
          });

          describe('I have completed copyListing_1_3 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:10,status:"hasCompleted"};
              events = events.concat(utils.createWorkflowMockEvents("copyListing_1_3",options));
            });

            it('should schedule the lambda function vreasyRequest for getWorkflow_4', function(done) {
              utils.runDecider(events, function() {
                var decision = utils.getLastDecision();
                assert.equal(decision.decisionType, "ScheduleLambdaFunction");
                assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_4");

                var decisionAttributes = utils.getDecisionAttributes(decision);
                var input = JSON.parse(decisionAttributes.input);
                assert.equal(input.input.endpoint, 'Workflows');
                assert.equal(input.input.action, 'get_workflows');
                assert.equal(input.input.params.workflow_name, 'copyListing');
                assert.equal(input.input.params.resource_id, 4);

                done();
              });
            });

            describe('I have completed getWorkflow_4 ---', function(){
              beforeEach(function() {
                options = {isChild:false,initialId:13,status:"hasCompleted",result:[{id: 12}]};
                events = events.concat(utils.createLambdaMockEvents("getWorkflow_4",options));
              });

              it('should schedule child workflow copyListing_1_4', function(done) {
                utils.runDecider(events, function() {
                  assert.equal(utils.getDecisionCount(), 1);

                  var decision = utils.getLastDecision();
                  assert.equal(decision.decisionType, "StartChildWorkflowExecution");
                  assert.equal(utils.getLambdaNameFromDecision(decision), "copyListing_1_4");
                  var decisionAttributes = utils.getDecisionAttributes(decision);
                  var input = JSON.parse(decisionAttributes.input);
                  assert.equal(input.listing_id, 1);
                  assert.equal(input.target_listing_id, 4);
                  assert.equal(input.vreasy_workflow_id, 12);

                  done();
                });
              });

              describe('I have completed copyListing_1_4 ---', function(){
                beforeEach(function() {
                  options = {isChild:true,initialId:16,status:"hasCompleted"};
                  events = events.concat(utils.createWorkflowMockEvents("copyListing_1_4",options));
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
      });

      describe('Activity getWorkflow_3 has failed ---', function(){
        beforeEach(function() {
          options = {isChild:false,initialId:4,status:"hasFailed",result:[{id: 11}]};
          events = events.concat(utils.createLambdaMockEvents("getWorkflow_3",options));
          options = {isChild:true,initialId:7,status:"hasBeenScheduled"};
          events = events.concat(utils.createWorkflowMockEvents("copyListing_1_2",options));
        });

        it('should wait for copyListing_1_2 to complete', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 0);
            done();
          });
        });

        describe('I have completed copyListing_1_2 ---', function(){
          beforeEach(function() {
            options = {isChild:true,initialId:7,status:"hasCompleted"};
            events = events.concat(utils.createWorkflowMockEvents("copyListing_1_2",options));
          });

          it('should schedule the lambda function vreasyRequest for getWorkflow_4', function(done) {
            utils.runDecider(events, function() {
              var decision = utils.getLastDecision();
              assert.equal(decision.decisionType, "ScheduleLambdaFunction");
              assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_4");

              var decisionAttributes = utils.getDecisionAttributes(decision);
              var input = JSON.parse(decisionAttributes.input);
              assert.equal(input.input.endpoint, 'Workflows');
              assert.equal(input.input.action, 'get_workflows');
              assert.equal(input.input.params.workflow_name, 'copyListing');
              assert.equal(input.input.params.resource_id, 4);

              done();
            });
          });

          describe('I have completed getWorkflow_4 ---', function(){
            beforeEach(function() {
              options = {isChild:false,initialId:10,status:"hasCompleted",result:[{id: 12}]};
              events = events.concat(utils.createLambdaMockEvents("getWorkflow_4",options));
            });

            it('should schedule child workflow copyListing_1_4', function(done) {
              utils.runDecider(events, function() {
                assert.equal(utils.getDecisionCount(), 1);

                var decision = utils.getLastDecision();
                assert.equal(decision.decisionType, "StartChildWorkflowExecution");
                assert.equal(utils.getLambdaNameFromDecision(decision), "copyListing_1_4");
                var decisionAttributes = utils.getDecisionAttributes(decision);
                var input = JSON.parse(decisionAttributes.input);
                assert.equal(input.listing_id, 1);
                assert.equal(input.target_listing_id, 4);
                assert.equal(input.vreasy_workflow_id, 12);

                done();
              });
            });

            describe('Child workflow copyListing_1_4 has failed ---', function(){
              beforeEach(function() {
                options = {isChild:true,initialId:13,status:"hasFailed"};
                events = events.concat(utils.createWorkflowMockEvents("copyListing_1_4",options));
              });

              it('should fail workflow execution', function(done) {
                utils.runDecider(events, function() {
                  assert.equal(utils.getDecisionCount(), 1);

                  var decision = utils.getLastDecision();
                  assert.equal(decision.decisionType, "FailWorkflowExecution");
                  var decisionAttributes = utils.getDecisionAttributes(decision);
                  var details = JSON.parse(decisionAttributes.details);
                  assert.equal(details.length, 2);
                  assert.equal(details[0].activityId, "getWorkflow_3");
                  assert.equal(details[1].activityId, "copyListing_1_4");

                  done();
                });
              });
            });
          });
        });
      });
    });
  });
});
