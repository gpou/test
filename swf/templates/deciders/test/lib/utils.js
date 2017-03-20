var DecisionTask = require('../../lib/decision_task')
    fs = require('fs')
    assert = require('assert')
    Workflow = require('../../lib/workflow')
    Swagger = require('swagger-client')
    Logger = require('../../lib/logger.js')
    LoggerConsole = require('../../lib/logger-console');

module.exports = {
  decisions: null,
  context: null,
  event: null,
  workflow: null,
  resource: null,

  setEnvironment: function(deciderFunction, options){
    this.deciderFunction = deciderFunction;
    this.options = options || {}
    this.options.logLevel = Logger.LOG_LEVELS.debug;
    this.options.logTransport = LoggerConsole;
    this.options.mock = true;
    this.context = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:836897382102:function:deciderMyDecider:circle'
    };
    this.event = {
      workflowExecution: {
        workflowId: 'mainWorkflowExecutionId',
        runId: 'mainWorkflowRunId'
      },
      workflowType: {
        name: 'myWorkflow'
      }
    };
  },

  runDecider: function(mockEvents, cb) {
    // clone the original event and add the mockEvents
    var event = JSON.parse(JSON.stringify(this.event));
    this.workflow = new Workflow(event, this.context, this.options);

    var that = this;

    // Mock some functions on the workflow which are not needed during testing
    this.workflow.updateWorkflowStatus = function(status, notes, options) {
      return;
    }
    this.workflow.finish = this.workflow.readWorkflowHistory = function(callback) {
      callback();
    }
    this.workflow.setupWorkflowTimeoutTimer = function() {
      return;
    }
    this.workflow.readWorkflowHistory = function(callback) {
      callback();
    }

    // Mock some functions in order to be able to check for activities and child workflows existance
    var originalLambdaActivity = this.workflow.lambdaActivity;
    this.workflow.lambdaActivity = function(params, options) {
      that.checkFunctionExistence('activities', params.name);
      if (params.name == 'vreasyRequest') {
        that.checkVreasyRequest(params.input);
      }
      return originalLambdaActivity.call(that.workflow, params, options);
    }

    var originalChildWorkflow = this.workflow.childWorkflow;
    this.workflow.childWorkflow = function(params, options) {
      that.checkFunctionExistence('deciders', params.workflow.name);
      return originalChildWorkflow.call(that.workflow, params, options);
    }

    this.workflow.eventsHistory = mockEvents;

    this.workflow.run(this.deciderFunction, cb);
  },

  getLastDecision: function(){
    var decisions = this.workflow.getDecisions();
    if (decisions && decisions.length > 0){
      return decisions[decisions.length - 1];
    }else{
      return null;
    }
  },

  getDecisionCount: function(){
    var decisions = this.workflow.getDecisions();
    return (decisions ? decisions.length : 0);
  },

  getDecisions: function(){
    return this.workflow.getDecisions();
  },

  checkFunctionExistence: function(functionType, functionName) {
    var path =  __dirname + '/../../../../../../' + functionType + '/' + functionName;
    try {
      fs.accessSync(path, fs.F_OK);
    } catch (e) {
      assert(false, 'Function ' + functionName + ' does not exist in ' + functionType + '/' + functionName);
    }
  },

  checkVreasyRequest: function(activityInput) {
    var endpoint = activityInput.endpoint;
    var action = activityInput.action;
    var params = activityInput.params;

    this.initSwagger();
    var group = this.swagger[endpoint];
    var operation = group.operations[action];
    if (!operation) {
      assert.fail(true, false, "request to non-existent Vreasy endpoint " + endpoint + ":" + action);
    }

    params = Object.assign({}, {
      xoauth_requestor_id: 10,
      operator_id: 11,
      api_key_id: 12
    }, params);

    var operationParameters = operation.parameters || []
    for (var key in params) {
      var found = false;
      for (var i = 0; i < operationParameters.length; i++) {
        if (operation.parameters[i].name == key) {
          found = true;
        }
      }
      if (!found) {
        assert.fail(true, false, "invalid parameter " + key + " for Vreasy request " + endpoint + ":" + action);
      }
    }
  },

  initSwagger: function() {
    if (!this.swagger) {
      var swaggerFile = __dirname + '/../../../../swagger.json';
      console.log('   reading swagger from ' + swaggerFile);
      var swaggerSpec = JSON.parse(fs.readFileSync(swaggerFile, 'utf8'));
      this.swagger = new Swagger({
        url: 'http://foo.bar',
        spec: {}
      });
      this.swagger.buildFromSpec(swaggerSpec);
    }
  },

  getLambdaNameFromDecision: function(decision){
    var decisionType = decision.decisionType;
    var attrName = decisionType.charAt(0).toLowerCase() + decisionType.slice(1) + "DecisionAttributes";
    if (decisionType.indexOf("Workflow") > -1){
      return decision[attrName].control;
    }else{
      return decision[attrName].id;
    }
  },

  getDecisionAttributes: function(decision){
    var decisionType = decision.decisionType;
    var attrName = decisionType.charAt(0).toLowerCase() + decisionType.slice(1) + "DecisionAttributes";
    return decision[attrName];
  },

  createMockEvent: function(eventType, eventId, input){
    var attributesName = eventType.charAt(0).toLowerCase() + eventType.slice(1) + "EventAttributes";
    var attributes = "";
    if (input){
      attributes = input;
    }
    var mockEvent = {};

    mockEvent.eventType = eventType;
    if (eventId)
      mockEvent.eventId = eventId;
    mockEvent[attributesName] = attributes;

    return mockEvent;
  },

  createLambdaMockEvents: function(lambdaName, options){
    var id = options.initialId;
    var results = [];
    var mockScheduled = {};
    mockScheduled.eventType = "LambdaFunctionScheduled";
    mockScheduled.eventId = id;
    mockScheduled.lambdaFunctionScheduledEventAttributes = {};
    mockScheduled.lambdaFunctionScheduledEventAttributes.id = lambdaName;
    results.push(mockScheduled);
    if (options.status == "hasFailed"){
      var mockFailed = {};
      mockFailed.eventType = "LambdaFunctionFailed";
      mockFailed.eventId = id+1;
      mockFailed.lambdaFunctionFailedEventAttributes = {};
      mockFailed.lambdaFunctionFailedEventAttributes.scheduledEventId = id;
      mockFailed.lambdaFunctionFailedEventAttributes.details = "";
      results.push(mockFailed);
    }
    if (options.status == "hasCompleted"){
      var mockStarted = {};
      mockStarted.eventType = "LambdaFunctionStarted";
      mockStarted.eventId = id+1;
      mockStarted.lambdaFunctionStartedEventAttributes = {};
      mockStarted.lambdaFunctionStartedEventAttributes.scheduledEventId = id;
      results.push(mockStarted);

      var mockCompleted = {};
      mockCompleted.eventType = "LambdaFunctionCompleted";
      mockCompleted.eventId = id+2;
      mockCompleted.lambdaFunctionCompletedEventAttributes = {};
      mockCompleted.lambdaFunctionCompletedEventAttributes.scheduledEventId = id;
      mockCompleted.lambdaFunctionCompletedEventAttributes.result = options.result;
      results.push(mockCompleted);
    }
    return results;
  },



  createWorkflowMockEvents: function(wfName, options){
    var id = options.initialId;
    var results = [];

    var mockStarted = {};
    if (options.isChild){
      mockStarted.eventType = "ChildWorkflowExecutionStarted";
      mockStarted.childWorkflowExecutionStartedEventAttributes = {};
      if (options.input){
        console.log("-----------");
        console.log(options.input);
        console.log('-----------');
         mockStarted.childWorkflowExecutionStartedEventAttributes.input = options.input;
      }
      mockStarted.childWorkflowExecutionStartedEventAttributes.control = wfName;
    }else{
      mockStarted.eventType = "WorkflowExecutionStarted";
      mockStarted.workflowExecutionStartedEventAttributes = {};
      if (options.input){
         mockStarted.workflowExecutionStartedEventAttributes.input = options.input;
      }
      mockStarted.workflowExecutionStartedEventAttributes.control = wfName;

    }
    mockStarted.eventId = id;
    results.push(mockStarted);

    if (options.isChild){
      var mockInitiated = {};
      mockInitiated.eventType = "StartChildWorkflowExecutionInitiated";
      mockInitiated.startChildWorkflowExecutionInitiatedEventAttributes = {};
      mockInitiated.startChildWorkflowExecutionInitiatedEventAttributes.control = wfName;
      mockInitiated.eventId = id+1;

      results.push(mockInitiated);
    }

    var attributes = {
      startedEventId:id,
      initiatedEventId:id+1,
      workflowExecution:{},
      workflowType:{
        name:wfName,
        version:"1.0.0"
      },
    }
    if (options.status == "hasCompleted"){
      var mockCompleted = {};
      if (options.isChild){
        mockCompleted.eventType = "ChildWorkflowExecutionCompleted";
        mockCompleted.childWorkflowExecutionCompletedEventAttributes = attributes;
        mockCompleted.childWorkflowExecutionCompletedEventAttributes.result = options.result;
      }else{
        mockCompleted.eventType = "WorkflowExecutionCompleted";
        mockCompleted.workflowExecutionCompletedEventAttributes = attributes;
      }
      mockCompleted.eventId = id+2;
      results.push(mockCompleted);
    }else{
      if (options.status == "hasFailed"){
        attributes.reason = "It has failed because...";
        var mockFailed = {};
        if (options.isChild){
          mockFailed.eventType = "ChildWorkflowExecutionFailed";
          mockFailed.childWorkflowExecutionFailedEventAttributes = attributes;
        }else{
          mockFailed.eventType = "WorkflowExecutionFailed";
          mockFailed.workflowExecutionFailedEventAttributes = attributes;
        }
        mockFailed.eventId = id+2;
        results.push(mockFailed);
      }
    }

    return results;
  }

};
