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
      target_property_ids: [2, 3],
      listings_to_copy: [
        {
          target_property_id: 2,
          listings_to_copy: [
            {source_listing_id: 4, target_listing_id: 5},
            {source_listing_id: 6, target_listing_id: 7}
          ]
        }
      ],
      fields: 'title'
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyPropertyToProperty",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow_2', function(done) {
      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_2");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyPropertyToProperty');
        assert.equal(input.input.params.resource_id, 2);

        done();
      });
    });

    describe('I have completed getWorkflow_2 ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_2",options));
      });

      it('should schedule child workflow copyPropertyToProperty_2', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "copyPropertyToProperty_1_2");
          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.property_id, 1);
          assert.equal(input.target_property_id, 2);
          assert.equal(input.vreasy_workflow_id, 10);
          assert.deepEqual(input.listings_to_copy, [
              {source_listing_id: 4, target_listing_id: 5},
              {source_listing_id: 6, target_listing_id: 7}
          ]);

          done();
        });
      });

      describe('I have completed copyPropertyToProperty_1_2 ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:4,status:"hasCompleted"};
          events = events.concat(utils.createWorkflowMockEvents("copyPropertyToProperty_1_2",options));
        });

        it('should schedule the lambda function vreasyRequest for getWorkflow_3', function(done) {
          utils.runDecider(events, function() {
            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "ScheduleLambdaFunction");
            assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_3");

            var decisionAttributes = utils.getDecisionAttributes(decision);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.input.endpoint, 'Workflows');
            assert.equal(input.input.action, 'get_workflows');
            assert.equal(input.input.params.workflow_name, 'copyPropertyToProperty');
            assert.equal(input.input.params.resource_id, 3);

            done();
          });
        });

        describe('I have completed getWorkflow_3 ---', function(){
          beforeEach(function() {
            options = {isChild:false,initialId:7,status:"hasCompleted",result:[{id: 11}]};
            events = events.concat(utils.createLambdaMockEvents("getWorkflow_3",options));
          });

          it('should schedule child workflow copyPropertyToProperty_1_3', function(done) {
            utils.runDecider(events, function() {
              assert.equal(utils.getDecisionCount(), 1);

              var decision = utils.getLastDecision();
              assert.equal(decision.decisionType, "StartChildWorkflowExecution");
              assert.equal(utils.getLambdaNameFromDecision(decision), "copyPropertyToProperty_1_3");
              var decisionAttributes = utils.getDecisionAttributes(decision);
              var input = JSON.parse(decisionAttributes.input);
              assert.equal(input.property_id, 1);
              assert.equal(input.target_property_id, 3);
              assert.equal(input.vreasy_workflow_id, 11);

              done();
            });
          });

          describe('I have completed copyPropertyToProperty_1_3 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:10,status:"hasCompleted"};
              events = events.concat(utils.createWorkflowMockEvents("copyPropertyToProperty_1_3",options));
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
});

describe('TEST SUITE FOR WORKFLOW: copyPropertyToProperties with failures in getWorkflow ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      property_id: 1,
      target_property_ids: [2, 3],
      fields: 'title'
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyPropertyToProperties",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow_2', function(done) {
      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_2");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyPropertyToProperty');
        assert.equal(input.input.params.resource_id, 2);

        done();
      });
    });

    describe('Activity getWorkflow_2 failed ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasFailed"};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_2",options));
      });

      it('should schedule the lambda function vreasyRequest for getWorkflow_3', function(done) {
        utils.runDecider(events, function() {
          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "ScheduleLambdaFunction");
          assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_3");

          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.input.endpoint, 'Workflows');
          assert.equal(input.input.action, 'get_workflows');
          assert.equal(input.input.params.workflow_name, 'copyPropertyToProperty');
          assert.equal(input.input.params.resource_id, 3);

          done();
        });
      });

      describe('I have completed getWorkflow_3 ---', function(){
        beforeEach(function() {
          options = {isChild:false,initialId:4,status:"hasCompleted",result:[{id: 11}]};
          events = events.concat(utils.createLambdaMockEvents("getWorkflow_3",options));
        });

        it('should schedule child workflow copyPropertyToProperty_1_3', function(done) {
          utils.runDecider(events, function() {
            assert.equal(utils.getDecisionCount(), 1);

            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "StartChildWorkflowExecution");
            assert.equal(utils.getLambdaNameFromDecision(decision), "copyPropertyToProperty_1_3");
            var decisionAttributes = utils.getDecisionAttributes(decision);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.property_id, 1);
            assert.equal(input.target_property_id, 3);
            assert.equal(input.vreasy_workflow_id, 11);

            done();
          });
        });

        describe('I have completed copyPropertyToProperty_1_3 ---', function(){
          beforeEach(function() {
            options = {isChild:true,initialId:7,status:"hasCompleted"};
            events = events.concat(utils.createWorkflowMockEvents("copyPropertyToProperty_1_3",options));
          });

          it('should fail workflow execution', function(done) {
            utils.runDecider(events, function() {
              assert.equal(utils.getDecisionCount(), 1);

              var decision = utils.getLastDecision();
              assert.equal(decision.decisionType, "FailWorkflowExecution");
              var decisionAttributes = utils.getDecisionAttributes(decision);
              var details = JSON.parse(decisionAttributes.details);
              assert.equal(details[0].activityId, "getWorkflow_2");

              done();
            });
          });
        });
      });
    });
  });
});

describe('TEST SUITE FOR WORKFLOW: copyPropertyToProperties with failures in copyProperty ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {
      property_id: 1,
      target_property_ids: [2,3],
      fields: 'title'
    }
    options = {isChild:false, initialId:0, status:"notCompleted", input:input};
    events = utils.createWorkflowMockEvents("copyPropertyToProperties",options);
  });

  describe('I have started the workflow ---', function(){
    it('should schedule the lambda function vreasyRequest for getWorkflow_2', function(done) {
      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_2");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Workflows');
        assert.equal(input.input.action, 'get_workflows');
        assert.equal(input.input.params.workflow_name, 'copyPropertyToProperty');
        assert.equal(input.input.params.resource_id, 2);

        done();
      });
    });

    describe('I have completed getWorkflow_2 ---', function(){
      beforeEach(function() {
        options = {isChild:false,initialId:1,status:"hasCompleted",result:[{id: 10}]};
        events = events.concat(utils.createLambdaMockEvents("getWorkflow_2",options));
      });

      it('should schedule child workflow copyPropertyToProperty_1_2', function(done) {
        utils.runDecider(events, function() {
          assert.equal(utils.getDecisionCount(), 1);

          var decision = utils.getLastDecision();
          assert.equal(decision.decisionType, "StartChildWorkflowExecution");
          assert.equal(utils.getLambdaNameFromDecision(decision), "copyPropertyToProperty_1_2");
          var decisionAttributes = utils.getDecisionAttributes(decision);
          var input = JSON.parse(decisionAttributes.input);
          assert.equal(input.property_id, 1);
          assert.equal(input.target_property_id, 2);
          assert.equal(input.vreasy_workflow_id, 10);

          done();
        });
      });

      describe('Child workflow copyPropertyToProperty_1_2 has failed ---', function(){
        beforeEach(function() {
          options = {isChild:true,initialId:4,status:"hasFailed"};
          events = events.concat(utils.createWorkflowMockEvents("copyPropertyToProperty_1_2",options));
        });

        it('should schedule the lambda function vreasyRequest for getWorkflow_3', function(done) {
          utils.runDecider(events, function() {
            var decision = utils.getLastDecision();
            assert.equal(decision.decisionType, "ScheduleLambdaFunction");
            assert.equal(utils.getLambdaNameFromDecision(decision), "getWorkflow_3");

            var decisionAttributes = utils.getDecisionAttributes(decision);
            var input = JSON.parse(decisionAttributes.input);
            assert.equal(input.input.endpoint, 'Workflows');
            assert.equal(input.input.action, 'get_workflows');
            assert.equal(input.input.params.workflow_name, 'copyPropertyToProperty');
            assert.equal(input.input.params.resource_id, 3);

            done();
          });
        });

        describe('I have completed getWorkflow_3 ---', function(){
          beforeEach(function() {
            options = {isChild:false,initialId:7,status:"hasCompleted",result:[{id: 11}]};
            events = events.concat(utils.createLambdaMockEvents("getWorkflow_3",options));
          });

          it('should schedule child workflow copyPropertyToProperty_1_3', function(done) {
            utils.runDecider(events, function() {
              assert.equal(utils.getDecisionCount(), 1);

              var decision = utils.getLastDecision();
              assert.equal(decision.decisionType, "StartChildWorkflowExecution");
              assert.equal(utils.getLambdaNameFromDecision(decision), "copyPropertyToProperty_1_3");
              var decisionAttributes = utils.getDecisionAttributes(decision);
              var input = JSON.parse(decisionAttributes.input);
              assert.equal(input.property_id, 1);
              assert.equal(input.target_property_id, 3);
              assert.equal(input.vreasy_workflow_id, 11);

              done();
            });
          });

          describe('I have completed copyPropertyToProperty_1_3 ---', function(){
            beforeEach(function() {
              options = {isChild:true,initialId:10,status:"hasCompleted"};
              events = events.concat(utils.createWorkflowMockEvents("copyPropertyToProperty_1_3",options));
            });

            it('should fail workflow execution', function(done) {
              utils.runDecider(events, function() {
                assert.equal(utils.getDecisionCount(), 1);

                var decision = utils.getLastDecision();
                assert.equal(decision.decisionType, "FailWorkflowExecution");
                var decisionAttributes = utils.getDecisionAttributes(decision);
                var details = JSON.parse(decisionAttributes.details);
                assert.equal(details[0].activityId, "copyPropertyToProperty_1_2");

                done();
              });
            });
          });
        });
      });
    });
  });
});
