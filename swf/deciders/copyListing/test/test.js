var assert = require('assert')
    deciderFunction = require('../index.js').deciderFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(deciderFunction, {
  limit: 10000,
  activityRetries: false,
  workflowRetries: false
});

describe('--- TEST SUITE FOR WORKFLOW: copyListing (listing to listing) ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {listing_id: 10, target_listing_id: 11, fields: 'title'};
    options = {isChild:false,initialId:0,status:"notCompleted",input:input};
    events = utils.createWorkflowMockEvents("copyListing",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start the lambda functions vreasyRequest', function(done) {

      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "copyTo_11");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Listings');
        assert.equal(input.input.action, 'copy_listing');
        assert.equal(input.input.params.listing_id, 10);
        assert.equal(input.input.params.target_listing_id, 11);
        assert.equal(input.input.params.deactivated, true);

        done();
      });
    });
  });
});

describe('--- TEST SUITE FOR WORKFLOW: copyListing (property to listing) ---', function(){
  var options;
  var events;

  beforeEach(function() {
    var input = {property_id: 10, target_listing_id: 11, fields: 'title'};
    options = {isChild:false,initialId:0,status:"notCompleted",input:input};
    events = utils.createWorkflowMockEvents("copyListing",options);
  });

  describe('--- I have started the workflow ---', function(){
    it('should decide to start the lambda functions vreasyRequest', function(done) {

      utils.runDecider(events, function() {
        var decision = utils.getLastDecision();
        assert.equal(decision.decisionType, "ScheduleLambdaFunction");
        assert.equal(utils.getLambdaNameFromDecision(decision), "copyTo_11");

        var decisionAttributes = utils.getDecisionAttributes(decision);
        var input = JSON.parse(decisionAttributes.input);
        assert.equal(input.input.endpoint, 'Properties');
        assert.equal(input.input.action, 'copy_property');
        assert.equal(input.input.params.property_id, 10);
        assert.equal(input.input.params.target_listing_id, 11);
        assert.equal(input.input.params.deactivated, true);

        done();
      });
    });
  });
});
