var DecisionTask = require('./decision_task')
    Logger = require('./logger')
    LoggerCloudwatch = require('./logger-cloudwatch')
    AWS = require('aws-sdk')
    async = require('async')
    config = require('../config/config')
    defaultTaskList = 'vreasyTaskList';

AWS.config = new AWS.Config(config.aws);

var Workflow = function(event, context, options) {
  this.swf = new AWS.SWF();

  this.event = event;
  this.context = context;
  this.eventsHistory = [];
  this.activityResults = [];
  this.continue = true;
  this.options = options || {};

  this.logger = new Logger({
    logLevel: this.options.logLevel,
    transport: this.options.logTransport || LoggerCloudwatch
  });
};

Workflow.prototype = {

  run: function(deciderFunction, cb) {
    var _this = this;
    var series = [];

    series.push(function(callback) {
      // Read the events history from SWF
      _this.readWorkflowHistory(callback);
    });

    series.push(function(callback) {
      // Instantiate a DecisionTask, which will handle the internals of swf
      _this.decision_task = new DecisionTask(_this.eventsHistory, {logger: _this.logger});
      callback();
    });

    series.push(function(callback) {
      // Setup the workflow by using the parameters received (and stored on the first event
      // of the events history)
      _this.setup();
      callback();
    });

    series.push(function(callback) {
      // Call the main function of the workflow, which will take one or more decisions
      deciderFunction(_this);
      callback();
    });

    series.push(function(callback) {
      // Send the decisions to SWF
      _this.finish(callback);
    });

    async.series(series, function(err, response) {
      // Flush the logger (send the log entries to either cloudwatch or to the console), and then
      // either call the callback function (during testing), or call the context.fail / context.succeed
      // (during real executions in lambda)
      _this.logger.flush(function() {
        if (cb) {
          cb(err, response);
        } else {
          if (err) {
            _this.context.fail(err);
          } else {
            _this.context.succeed("ok");
          }
        }
      });
    });
  },

  // Read from SWF the events history for this workflow execution
  readWorkflowHistory: function(callback, nextPageToken) {
    var _this = this;
    nextPageToken = nextPageToken || null;
    var params = {
      domain: this.getAlias(),
      execution: {
        runId: this.event.workflowExecution.runId,
        workflowId: this.event.workflowExecution.workflowId
      },
      maximumPageSize: 100,
      nextPageToken: nextPageToken,
      reverseOrder: false
    };
    this.swf.getWorkflowExecutionHistory(params, function(err, data) {
      if (err) {
        _this.logger.crit("Error while reading the workflow history", err);
        callback(true);
      } else {
        _this.eventsHistory.push.apply(_this.eventsHistory, data.events);
        if (data.nextPageToken) {
          _this.readWorkflowHistory(callback, data.nextPageToken);
        } else {
          // Filter the events history to get only those previous to the currently running decision task
          var index = -1;
          var length = _this.eventsHistory.length;
          var filteredIndex = -1;
          var filteredEvents = [];
          while (++index < length) {
            if (_this.eventsHistory[index].eventId < _this.event.startedEventId) {
              filteredEvents[++filteredIndex] = _this.eventsHistory[index];
            }
          }
          _this.eventsHistory = filteredEvents;
          callback();
        }
      }
    });
  },

  setup: function() {
    this.options.limit = this.options.limit || 100;

    // How many retries will be done for failed activities and child workflows
    if (this.options.activityRetries == undefined) {
      this.options.activityRetries = 2;
    }

    // Grab the input parameters from the events history
    this.input = this.decision_task.workflow_input() || {};

    // Options for workflow retries (this is different from retries of child workflows)
    if (this.input.options && this.input.options.workflowRetries !== undefined) {
      this.options.workflowRetries = this.input.options.workflowRetries;
    }
    if (this.options.workflowRetries == undefined) {
      this.options.workflowRetries = false;
    } else if (this.input.options && this.input.options.currentRetry) {
      this.options.currentRetry = this.input.options.currentRetry;
    } else {
      this.options.currentRetry = 0;
    }

    // Attributes of the workflow execution
    this.main_workflow_run_id = (this.input.options && this.input.options.main_workflow_run_id)
      ? this.input.options.main_workflow_run_id
      : this.event.workflowExecution.runId;
    this.workflow_run_id = this.event.workflowExecution.runId;
    this.main_workflow_id = (this.input.options && this.input.options.main_workflow_id)
      ? this.input.options.main_workflow_id
      : this.event.workflowExecution.workflowId;
    this.workflow_id = this.event.workflowExecution.workflowId;
    this.workflow_name = this.event.workflowType.name;

    // Setup the log_level on the logger (value can be sent as an input parameter)
    if (this.input.options && this.input.options.log_level) {
      this.log_level = this.input.options.log_level;
      this.logger.setLogLevel(this.log_level);
    } else {
      this.log_level = this.logger.getLogLevel();
    }

    // Send the context variables to the logger (those variables will appear on every log entry)
    this.logger.setContext({
      functionType: 'decider',
      functionName: this.getFunctionName(),
      domain: this.getAlias(),
      mainWorkflowRunId: this.main_workflow_run_id,
      workflowRunId: this.event.workflowExecution.runId,
      mainWorkflowId: this.main_workflow_id,
      workflowId: this.event.workflowExecution.workflowId
    });

    this.logger.info("Starting decider", this.input);
    this.logger.debug("Decider parameters received", {event: this.event, context: this.context, options: this.options});

    // If a request for cancelling the workflow has been received, we should do nothing else
    if (!this.checkForRequestCancel()) {
      // Setup a timer which will cancel the workflow when triggered instead of using the timeout
      // of the workflow, so that we can cleanup and finish the execution properly
      this.setupWorkflowTimeoutTimer();
      // Schedule an activity to update the status of the workflow on the db via the Vreasy api
      this.updateWorkflowStatus('STARTED', this.options.currentRetry ? {retry: this.options.currentRetry} : null);
    }
  },

  // Schedule an activity, either synchronous or asynchronously
  // This method will take care of parsing the events history to see if the activity has already been
  // scheduled, if it has completed, etc
  // It will also take care of the automatic retries of the activities upon failure
  lambdaActivity: function(params, options) {
    if (!this.canContinue()) return;
    options = options || {};
    var failWorkflowOnFailure = (options.failWorkflowOnFailure != undefined) ? options.failWorkflowOnFailure : true;
    var async = options.async || false;
    options.retries = (options.retries != undefined) ? options.retries : (this.options.activityRetries || false);
    options.current_retry = options.current_retry || 0;
    var id = params.id;

    if (options.retries && (options.retries > 1) && (options.current_retry > 0)) {
      var id = params.id + '_RETRY_' + options.current_retry;
    }
    if(this.decision_task.is_lambda_scheduled(id)) {
      if(event_id = this.decision_task.has_lambda_completed(id)) {
        if (options.waitForSignal) {
          var signal = this.decision_task.signal_input(id);
          if (signal === null) {
            if (!this.is_replaying(event_id)) {
              this.logger.info("waiting for activity " + id + " to be signaled");
            }
            var ret = this.addActivityResult(params.id, {status: 'waiting'});
            if (async) {
              return ret;
            }
            this.sendDecisionsAndExit();
          } else if (signal.status == 'completed') {
            if (!this.is_replaying(event_id)) {
              this.logger.info('activity ' + id + ' signaled as completed', signal.result);
            }
            return this.addActivityResult(params.id, {status: 'completed', result: signal.result});
          } else if (signal.status == 'failed') {
            if (options.retries && options.current_retry < options.retries - 1) {
              options.current_retry++;
              if (!this.is_replaying(event_id)) {
                this.logger.info('activity ' + id + ' signaled as failed (attempt ' + options.current_retry + ')', signal.result);
              }
              this.lambdaActivity(params, options);
            } else {
              if (!this.is_replaying(event_id)) {
                this.logger.info('activity ' + id + ' signaled as failed (last attempt)', signal.result);
              }
              var ret = this.addActivityResult(params.id, {status: 'failed', result: signal.result});
              if (failWorkflowOnFailure) {
                this.failWorkflow('activity ' + id + ' signaled as failed', signal.result);
              } else {
                return ret;
              }
            }
          } else {
            this.failWorkflow('activity ' + id + ' signaled with an invalid status', signal);
          }
          return;
        }
        var results = this.parseResponse(this.decision_task.lambda_results(id));
        if (!this.is_replaying(event_id)) {
          this.logger.info('activity ' + id + ' completed', results);
        }
        return this.addActivityResult(params.id, {status: 'completed', result: results});
      } else if(event_id = this.decision_task.has_lambda_timedout(id)) {
        var details = this.parseResponse(this.decision_task.lambda_timedout_details(id));
        if (options.retries && options.current_retry < options.retries - 1) {
          options.current_retry++;
          if (!this.is_replaying(event_id)) {
            this.logger.info('activity ' + id + ' timed out (attempt ' + options.current_retry + ')', details);
          }
          this.lambdaActivity(params, options);
        } else {
          if (!this.is_replaying(event_id)) {
            this.logger.info('activity ' + id + ' timed out (last attempt)', details);
          }
          var ret = this.addActivityResult(params.id, {status: 'timedout', result: details});
          if (failWorkflowOnFailure) {
            this.failWorkflow('activity ' + id + ' timed out', details);
          } else {
            return ret;
          }
        }
      } else if(event_id = this.decision_task.has_lambda_failed(id)) {
        var details = this.parseResponse(this.decision_task.lambda_failure_details(id));
        if (options.retries && options.current_retry < options.retries - 1) {
          options.current_retry++;
          if (!this.is_replaying(event_id)) {
            this.logger.info('activity ' + id + ' failed (attempt ' + options.current_retry + ')', details);
          }
          this.lambdaActivity(params, options);
        } else {
          if (!this.is_replaying(event_id)) {
            this.logger.info('activity ' + id + ' failed (last attempt)', details);
          }
          var ret = this.addActivityResult(params.id, {status: 'failed', result: details});
          if (failWorkflowOnFailure) {
            this.failWorkflow('activity ' + id + ' failed', details);
          } else {
            return ret;
          }
        }
      } else {
        this.logger.info("waiting for activity " + id + " to complete.");
        var ret = this.addActivityResult(params.id, {status: 'waiting'});
        if (async) {
          return ret;
        }
        this.sendDecisionsAndExit();
      }
    } else {
      var intermediaryLambda = "callLambdaWithAlias";
      var startAttributes = this.getWorkflowStartAttributes();
      //var timeout = params.timeout || startAttributes.taskStartToCloseTimeout;
      var functionName = 'activity' + params.name.charAt(0).toUpperCase() + params.name.slice(1);
      var input = {
        input: this.addDefaultParamsToActivityParams(params.input || {}),
        functionName: functionName,
        alias: this.getAlias()
      }
      var sla = {
        id: id,
        name: "callLambdaWithAlias",
        input: JSON.stringify(input)
      };
      this.logger.info("scheduling activity " + id, {input: params.input, id: id});

      this.decision_task.addDecision({
         "decisionType": "ScheduleLambdaFunction",
         "scheduleLambdaFunctionDecisionAttributes": sla
      });
      var ret = this.addActivityResult(params.id, {status: 'scheduled'});
      if (async) {
        return ret;
      } else {
        this.sendDecisionsAndExit();
      }
    }
  },

  // Schedule an activity asynchronously (the waitForAll method will need to be called afterwards)
  lambdaActivityAsync: function(params, options) {
    if (!this.canContinue()) return;
    options = options || {};
    options.async = true;
    return this.lambdaActivity(params, options);
  },

  activityTimer: function(params) {

    if (!this.canContinue()) return;

    var timerId = "timer_" + params.id;
    if(this.decision_task.timer_scheduled(timerId)) {
      if (this.decision_task.timer_fired(timerId)) {
        this.lambdaActivity({
          id: 'activity_' + params.id,
          name: params.activity,
          input: params.input
        });
      } else {
        this.sendDecisionsAndExit();
      }
    } else {
      this.decision_task.start_timer({
        name: timerId,
        delay: params.delay
      }, {
        timerId: timerId,
      });
      this.sendDecisionsAndExit();
    }
  },

  // Schedule a child workflow, either synchronous or asynchronously
  // This method will take care of parsing the events history to see if the child has already been
  // scheduled, if it has completed, etc
  // It will also take care of the automatic retries of the childs upon failure
  childWorkflow: function(params, options) {
    if (!this.canContinue()) return;
    options = options || {};
    var failWorkflowOnFailure = (options.failWorkflowOnFailure != undefined) ? options.failWorkflowOnFailure : true;
    var async = options.async || false;
    options.retries = (options.retries != undefined) ? options.retries : (this.options.activityRetries || false);
    options.current_retry = options.current_retry || 0;
    var name = params.name;

    if (options.retries && (options.retries > 1) && (options.current_retry > 0)) {
      name = params.name + '_RETRY_' + options.current_retry;
    }
    if(event_id = this.decision_task.childworkflow_failed(name)) {
      var results = this.parseResponse(this.decision_task.childworkflow_failure_details(name));
      if (options.retries && options.current_retry < options.retries - 1) {
        options.current_retry++;
        if (!this.is_replaying(event_id)) {
          this.logger.info('child workflow ' + name + ' failed (attempt ' + options.current_retry + ')', results);
        }
        this.childWorkflow(params, options);
      } else {
        if (!this.is_replaying(event_id)) {
          this.logger.info('child workflow ' + name + ' failed (last attempt).', results);
        }
        var ret = this.addActivityResult(params.name, {status: 'failed', result: results});
        if (failWorkflowOnFailure) {
          this.failWorkflow('child workflow ' + name + ' failed', results);
        } else {
          return ret;
        }
      }
    } else if(this.decision_task.childworkflow_scheduled(name)) {
      if(event_id = this.decision_task.childworkflow_completed(name)) {
        var results = this.parseResponse(this.decision_task.childworkflow_results(name));
        if (!this.is_replaying(event_id)) {
          this.logger.info('child workflow ' + name + ' completed.', results);
        }
        var ret = this.addActivityResult(params.name, {status: 'completed', result: results});
        return ret;
      } else {
        this.logger.info("waiting for child workflow " + name + " to complete.");
        var ret = this.addActivityResult(params.name, {status: 'waiting'});
        if (async) {
          return ret;
        }
        this.sendDecisionsAndExit();
      }
    }
    else {
      var workflowStartAttributes = this.getWorkflowStartAttributes();
      var timeout = params.executionStartToCloseTimeout || workflowStartAttributes.taskStartToCloseTimeout;
      var taskTimeout = params.taskStartToCloseTimeout || workflowStartAttributes.taskStartToCloseTimeout;
      var childPolicy = params.childPolicy || workflowStartAttributes.childPolicy;
      var startAttributes = {
        name: name,
        workflow: params.workflow
      }

      var swfAttributes = {
        input: this.addDefaultParamsToActivityParams(params.input || {}),
        lambdaRole: config.lambdaRole,
        taskList: {name: params.taskList || defaultTaskList},
        executionStartToCloseTimeout: timeout,
        taskStartToCloseTimeout: taskTimeout,
        childPolicy: childPolicy,
        workflowId: params.workflowId || null
      }
      this.logger.info("scheduling child workflow " + name, {startAttributes: startAttributes, swfAttributes: swfAttributes});
      this.decision_task.start_childworkflow(startAttributes, swfAttributes);

      var ret = this.addActivityResult(params.name, {status: 'scheduled'});
      if (async) {
        return ret;
      } else {
        this.sendDecisionsAndExit();
      }
    }
  },

  // Schedule a child workflow asynchronously (the waitForAll method will need to be called afterwards)
  childWorkflowAsync: function(params, options) {
    if (!this.canContinue()) return;
    options = options || {};
    options.async = true;
    return this.childWorkflow(params, options);
  },

  // Add to a params object some default parameters that are sent to every scheduled activity
  addDefaultParamsToActivityParams: function(params) {
    params.xoauth_requestor_id = params.xoauth_requestor_id || this.input.xoauth_requestor_id;
    params.operator_id = params.operator_id || this.input.operator_id;
    params.api_key_id = params.api_key_id || this.input.api_key_id;
    params.options = params.options || {};
    params.options.log_level = params.options.log_level || this.log_level;
    params.options.main_workflow_run_id = this.main_workflow_run_id;
    params.options.workflow_run_id = this.workflow_run_id;
    params.options.main_workflow_id = this.main_workflow_id;
    params.options.workflow_id = this.workflow_id;
    params.options.workflowRetries = false;
    params.options = this.removeNulls(params.options);
    return this.removeNulls(params);
  },

  // Remove any null attribute from an object (used when scheduling activities or child workflows)
  removeNulls: function(obj) {
    var isArray = obj instanceof Array;
    for (var k in obj) {
      if (obj[k] === null || obj[k] === undefined) {
        isArray ? obj.splice(k, 1) : delete obj[k];
      }
      else if (typeof obj[k] == "object") {
        this.removeNulls(obj[k]);
      }
      if (isArray && obj.length == k) {
        this.removeNulls(obj);
      }
    }
    return obj;
  },

  // Returns the status of an activity (scheduled, waiting, failed, timedout, completed)
  activityStatus: function(id) {
    return this.activityResults[id] != undefined ? this.activityResults[id].status : null;
  },

  // Returns the results of an activity
  activityResult: function(id) {
    return this.activityResults[id] != undefined ? this.activityResults[id].result : null;
  },

  // Save the results of an activity so that they can be later retrieved from the main workflow function
  // The result has the form: { status: (scheduled/waiting/failed/timedout/completed), result: someObject }
  addActivityResult: function(id, result) {
    this.activityResults[id] = result;
    return result;
  },

  // Wether an activity has finished (either with success of with failure)
  hasActivityFinished: function(id) {
    var status = this.activityStatus(id)
    return (status && status != 'scheduled' && status != 'waiting');
  },

  // Wait for all of the given activities to finish. If some of them has not finished, stop the
  // execution of the current decision task
  waitForAll: function(activities) {
    if (!this.canContinue()) return;
    for(var id in activities) {
      if (!this.hasActivityFinished(activities[id])) {
        this.sendDecisionsAndExit();
      }
    }
  },

  // Add a decision to complete the workflow, and then stop the execution of the current decision task
  completeWorkflow: function(result) {
    if (!this.canContinue()) return;
    this.updateWorkflowStatus('COMPLETED', {result: result});
    if (!this.canContinue()) return;
    this.logger.info("COMPLETE WORKFLOW");
    this.decision_task.stop({
      result: result
    });
    this.sendDecisionsAndExit();
  },

  // Add a decision to fail the workflow, and then stop the execution of the current decision task
  failWorkflow: function(reason, details) {
    if (!this.canContinue()) return;
    if (typeof details === 'string') {
      try {
        var d = JSON.parse(details);
        if (d.errorMessage) {
          reason = reason + ": " + d.errorMessage;
        }
      } catch (ex) {
        reason = reason + ": " + details;
      }
    } else if ((typeof details === 'object') && details.errorMessage) {
      reason = reason + ": " + details.errorMessage;
    }
    if (this.options.workflowRetries && this.options.currentRetry < this.options.workflowRetries - 1) {
      this.retryWorkflow(reason, details);
    } else {
      this.updateWorkflowStatus('FAILED', {reason: reason});
      if (!this.canContinue()) return;
      this.logger.info("FAIL WORKFLOW", {reason: reason, details: details});
      this.decision_task.fail({
        details: details,
        reason: reason
      });
    }
    this.sendDecisionsAndExit();
  },

  // Schedule an activity to update the workflow status, but only if this execution is a root workflow
  // or if it's a child workflow but was called with a parameter input.vreasy_workflow_id
  // (the later is used in copy workflows in order to update the child workflows on the vreasy db)
  updateWorkflowStatus: function(status, notes, options) {
    options = options || {};
    var execution_attributes = this.decision_task.workflow_execution_attributes();
    if (execution_attributes.continuedExecutionRunId ||
      this.main_workflow_run_id == this.workflow_run_id ||
      this.input.vreasy_workflow_id
    ) {
      var activityParams = {
        "id": "updateWorkflow-" + status,
        "name": "updateWorkflow",
        "input": {
          "debug_note": notes,
          "workflow": {
            "status": status
          }
        }
      }
      if (this.input.vreasy_workflow_id) {
        activityParams.input.id = this.input.vreasy_workflow_id;
        activityParams.input.workflow.workflow_run_id = this.workflow_run_id;
      } else {
        activityParams.input.run_id = this.main_workflow_run_id;
      }
      this.lambdaActivity(
        activityParams,
        Object.assign({}, { failWorkflowOnFailure: false }, options)
      );
    }
  },

  // Add a decision to retry the workflow because the current execution failed
  // It will send to the new executions the same parameter that it received, but also a currentRetry
  // parameter so that the new execution will know when to stop doing retries
  retryWorkflow: function(failureReason, failureDetails) {
    if (!this.canContinue()) return;
    this.logger.info("RETRY WORKFLOW", {reason: failureReason, details: failureDetails});
    var retry = this.options.currentRetry + 1;
    var options = Object.assign({}, this.options, {
      main_workflow_run_id: this.main_workflow_run_id,
      main_workflow_id: this.main_workflow_id,
      log_level: this.log_level,
      currentRetry:retry
    });
    var workflow_input = Object.assign({}, this.input, {options:options});
    var current_execution_attributes = this.decision_task.workflow_execution_attributes();
    var swfAttributes = this.removeNulls({
      childPolicy: current_execution_attributes.childPolicy,
      executionStartToCloseTimeout: current_execution_attributes.executionStartToCloseTimeout,
      input: JSON.stringify(workflow_input),
      lambdaRole: current_execution_attributes.lambdaRole,
      tagList: current_execution_attributes.tagList,
      taskList: current_execution_attributes.taskList,
      taskPriority: current_execution_attributes.taskPriority,
      taskStartToCloseTimeout: current_execution_attributes.taskStartToCloseTimeout
    });
    this.decision_task.continue_as_new_workflow(swfAttributes);
  },

  // Save the decisions taken during the current decision task and stop further processing
  // (TODO: the this.continue is a patch to allow the workflow to complete. Will need to find
  // a different way to do it - throw an exception? -)
  sendDecisionsAndExit: function() {
    if (!this.canContinue()) return;
    this.logger.info("SEND DECISION AND EXIT", {decisions: this.decision_task.decisions});
    this.continue = false;
  },

  // Send to SWF the decisions taken during the current decision task
  finish: function(callback) {
    if(!this.decision_task.decisions) {
      this.decision_task.decisions = [];
    }

    var params = {
      taskToken: this.event.taskToken,
      decisions: this.decision_task.decisions
    };

    this.swf.respondDecisionTaskCompleted(params, callback);
  },

  // Loop over the events history to find out wether a cancel request has been sent to the workflow
  // If yes, then perform the actual cancel on the workflow (doing it like this allows us to perform
  // any cleanup jobs on the workflow)
  checkForRequestCancel: function() {
    var eventId = this.decision_task.has_some_event_of_type('WorkflowExecutionCancelRequested');
    if (eventId !== null) {
      if (!this.is_replaying(eventId)) {
        this.logger.info("CANCEL WORKFLOW", {reason: 'request cancel was received'});
      }
      this.updateWorkflowStatus('CANCELLED', {reason: 'request cancel was received'});
      this.decision_task.cancel_workflow('request cancel was received');
      this.sendDecisionsAndExit();
      return true;
    }
  },

  // This function adds a timer to allow to perform some cleanup before the workflow times out
  // and if the timer is already set, it checks if it has been triggered
  // Also, when the workflow is starting or when it is about to complete, fail or timeout,
  // calls the updateWorkflow activity that will perform a POST request to Vreasy to update the workflow status
  setupWorkflowTimeoutTimer: function() {
    if (!this.canContinue()) return;
    var timerId = 'main_workflow_timer';
    if(this.decision_task.timer_scheduled(timerId)) {
      if( this.decision_task.timer_fired(timerId) ) {
        this.failWorkflow('workflow is about to time out');
      }
    } else {
      var startAttributes = this.getWorkflowStartAttributes();
      var wfTimeout = parseInt(startAttributes.executionStartToCloseTimeout);
      var cleanupTimeBeforeTimeout = parseInt(this.options.workflowCleanupTimeBeforeTimeout) || 20;
      var timeout = wfTimeout - cleanupTimeBeforeTimeout;
      this.logger.info('starting main workflow timer with ' + timeout + ' seconds');
      this.decision_task.start_timer({
        name: 'main_workflow_timer',
        delay: timeout
      }, {
        timerId: 'main_workflow_timer'
      });

    }
  },

  // Get the initial parameters sent to the workflow
  getWorkflowStartAttributes: function() {
    return this.decision_task._events[0].workflowExecutionStartedEventAttributes;
  },

  // Loop over the events history to find out wether the workflow has been marked as finished
  hasWorkflowFinished: function() {
    for (var i in this.decision_task._events) {
      var eventType = this.decision_task._events[i].eventType;
      if (eventType == 'WorkflowExecutionFailed'
        || eventType == 'WorkflowExecutionCompleted'
        || eventType == 'WorkflowExecutionTimedOut'
        || eventType == 'WorkflowExecutionCanceled'
        || eventType == 'WorkflowExecutionTerminated') {
        return true;
      }
    }
    return false;
  },

  canContinue: function() {
    return this.continue && !this.hasWorkflowFinished();
  },

  // Get the decisions saved on the decision_task
  getDecisions: function() {
    return this.decision_task ? this.decision_task.decisions : [];
  },

  // Convert an object saved on the events history, which is a string, into a json  object
  parseResponse: function(response) {
    if (typeof response === 'string') {
      try {
        var r = JSON.parse(response);
        return r;
      } catch (ex) {}
    }
    return response;
  },

  // Get the called lambda function name, which is found on the context attribute
  getFunctionName: function () {
    var attributes = this.getFunctionAttributesFromContext();
    return attributes.functionName;
  },

  // Get the alias of the called lambda function from the context
  getAlias: function () {
    var attributes = this.getFunctionAttributesFromContext();
    // If no alias was sent and the invoked function arn does not contain an alias, fail the workflow execution
    if (!attributes.alias) {
      this.logger.crit("Could not retreive alias from function context", {
        invokedFunctionArn: this.context.invokedFunctionArn,
        parsedAttributes: attributes
      });
      this.failWorkflow("lambda could not be called because we could not read the alias from the invoked function arn");
    }
    return(attributes.alias);
  },

  // Parse the lambda function attributes from the context (functionName and alias)
  getFunctionAttributesFromContext: function() {
    var arn = this.context.invokedFunctionArn;
    var regex = /^arn:aws:lambda:[a-z0-9\-]+:[0-9]{12}:function:([a-z0-9\-_]+):?([a-zA-Z0-9-_]+)?$/i;
    var match = arn.match(regex);
    var attributes = {
      functionName: '',
      alias: ''
    };
    if (match && match.length > 1) {
      attributes.functionName = match[1];
      if (match.length > 2) {
        attributes.alias = match[2];
      }
    }
    return attributes;
  },

  // Wether an event is being replayed (used to prevent duplicated entries on the logs)
  is_replaying: function(event_id) {
    return (event_id < this.event.previousStartedEventId);
  }
}

module.exports = Workflow;
