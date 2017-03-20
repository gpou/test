var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000,
  activityRetries: 2,
  workflowRetries: false
});

describe('--- TEST SUITE FOR WORKFLOW: myWorkflow ---', function(){
  /**
   * Write your tests here
   *
   * var options;
   * var events;

   * beforeEach(function() {
   *   options = {isChild:false,initialId:0,status:"notCompleted",input:{user_id: 10}};
   *   events = utils.createWorkflowMockEvents("myWorkflow",options);
   * });

   * describe('--- I have started the workflow ---', function(){
   *   it('should decide to start an activity', function(done) {
   *     utils.runDecider(events, function() {
   *       assert.equal(utils.getDecisionCount(), 1);
   *
   *       var decision = utils.getLastDecision();
   *       assert.equal(decision.decisionType, "ScheduleLambdaFunction");
   *       assert.equal(utils.getLambdaNameFromDecision(decision), "myActivity");
   *
   *       done();
   *     });
   *   });
   * });
   */
});
