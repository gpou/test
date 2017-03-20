var events = require('events')
    util = require('util')
    AWS = require('aws-sdk')
    _ = require('lodash-compat');


var Poller = exports.Poller = function(config) {

   events.EventEmitter.call(this);

   this.config = config;

   this.swfClient = new AWS.SimpleWorkflow();
   this.lambdaClient = new AWS.Lambda();

   this.shuttingDown = false;
   this.pollCount = 0;
   this.maxPollCount = 5;
};

util.inherits(Poller, events.EventEmitter);

/**
 * Poll Amazon WebService for new tasks in a loop.
 */
Poller.prototype.poll = function () {
  var _this = this;

  if (this.shuttingDown) {
    _this.emit('shutdown');
    return;
  }

  if (_this.maxPollCount && _this.pollCount >= _this.maxPollCount) {
    // If we reached the maximum polls allowed by execution, stop the poller and emit an 'stop' event
    // Also reset the pollCount, in case that the script running the poller wants to restart it
    _this.pollCount = 0;
    _this.emit('stopped');
    return;
  }
  _this.pollCount++;

  this.emit('poll');

  // Copy config
  var o = {}, k;
  for (k in this.config) {
    if (this.config.hasOwnProperty(k)) {
      o[k] = this.config[k];
    }
  }

  // Poll request on AWS
  this.request = this.swfClient.pollForDecisionTask(o, function (err, result) {
    if (err) {
      _this.emit('error', err);
      return;
    }

    // If no new task, emit an stopped event
    if (!result.taskToken) {
      _this.emit('stopped');
      return;
    }

    _this.onNewTask(result);
    _this.poll();
  });
};

Poller.prototype.shutDown = function () {
  this.shuttingDown = true;
}

/**
 * Callback for incoming tasks
 */
Poller.prototype.onNewTask = function(originalResult,result,_this, events) {
    //For the first call, events will not be passed.
    events = events || [];
    //Reference to the original this object.
    _this = _this || this;
    result = result || originalResult;
    events.push.apply(events,result.events);

    //If more pages are available, make call to fetch objects
    if(result.nextPageToken) {
        var pollConfig = _.clone(this.config);
        pollConfig.nextPageToken = result.nextPageToken;
        this.swfClient.pollForDecisionTask(pollConfig, function (err, nextPageResult) {
            if (err) {
                _this.emit('error', err);
                return;
            }
            _this.onNewTask(originalResult,nextPageResult,_this,events);

        });
    } else {
        var workflowType = originalResult.workflowType;
        var workflowName = workflowType.name;
        var workflowVersion = workflowType.version;
        var domain = this.config.domain;
        console.log("--- New Decision Task received ! (poller PID: " + process.pid + ")", workflowName, workflowVersion, domain);

        for (var i = 0; i < events.length; i++) {
          var eventType = events[i].eventType;
          if (eventType == 'WorkflowExecutionFailed'
            || eventType == 'WorkflowExecutionCompleted'
            || eventType == 'WorkflowExecutionTimedOut'
            || eventType == 'WorkflowExecutionCanceled'
            || eventType == 'WorkflowExecutionTerminated'
            || eventType == 'WorkflowExecutionContinuedAsNew') {
            console.log("--- Workflow is not running anymore (poller PID: " + process.pid + ")")
            return;
          }
        }

        // We use the worflow execution domain as the lambda alias for the function on the Qualifier param
        // Our lambda functions define aliases for every environment (ex: production, staging, developmentGemmapou, ...)
        var params = {
          FunctionName: 'decider' + workflowName.charAt(0).toUpperCase() + workflowName.substr(1),
          InvocationType: 'Event', // Do not wait for execution
          LogType: 'None',
          Payload: JSON.stringify(_.omit(originalResult, 'events')),
          Qualifier: domain
        };
        console.log("--- Invoking lambda  (poller PID: " + process.pid + ")", params);
        this.lambdaClient.invoke(params, function(err, data) {
          if (err) console.log("--- error " + err + " (poller PID: " + process.pid + ")", err.stack); // an error occurred
          else     console.log("--- success " + JSON.stringify(data) + " (poller PID: " + process.pid + ")"); // successful response
        });
    }

};
