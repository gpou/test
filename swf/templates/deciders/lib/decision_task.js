

var DecisionTask = function (events, options) {
    this._events = events;

    // Containing decisions made (array, or null if no decision was taken)
    this.decisions = null;

    options = options || {};
    this.logger = options.logger || new Logger();
}

DecisionTask.prototype = {

   /**
    * Add a decision
    * @param {Object} decision - decision to add to the response
    */
   addDecision: function(decision) {

      if (!this.decisions) {
         this.decisions = [];
      }

      this.decisions.push(decision);
   },


   /**
    * Sets the local decisions to an empty array. Call this method if no decisions can be made.<br />
    */
   wait: function() {

      if (!this.decisions) {
         this.decisions = [];
      }

   },


   /**
    * Add a "CompleteWorkflowExecution" decision to the response
    * @param {Object} stopAttributes - object containing a 'result' attribute. The result value can be a function (which will get evaluated), a string, or a json object.
    * @param {Object} [swfAttributes] - Additionnal attributes for 'completeWorkflowExecutionDecisionAttributes'
    */
   stop: function (stopAttributes, swfAttributes) {

      var sa = swfAttributes || {};

      // Result
      if(stopAttributes.result) {
         if (typeof stopAttributes.result === 'function') {
            sa.result = stopAttributes.result();
         }
         else {
            sa.result = stopAttributes.result;
         }
      }
      if(typeof sa.result !== 'string') {
         sa.result = JSON.stringify(sa.result);
      }

      this.addDecision({
         "decisionType": "CompleteWorkflowExecution",
         "completeWorkflowExecutionDecisionAttributes": sa
      });

    },

    /**
     * Add a new ScheduleLambdaFunction decision
     * @param {String} id - The unique Amazon SWF ID for the AWS Lambda task
     * @param {String} name - The name of the scheduled AWS Lambda function
     * @param {String} input - Input provided to the AWS Lambda function.
     * @param {String} startToCloseTimeout - The maximum time, in seconds, that the AWS Lambda function can take to execute from start to close before it is marked as failed.
     */
     scheduleLambdaFunction: function (id, name, input, startToCloseTimeout) {

      var sla;
      if (typeof id === 'object') { sla = id } else {
        sla = {
          "id": id, /* required */
          "name": name, /* required */
        };
        if (input) sla.input = input;
        if (startToCloseTimeout) sla.startToCloseTimeout = startToCloseTimeout;
      }
      this.addDecision({
        "decisionType": "ScheduleLambdaFunction",
        "scheduleLambdaFunctionDecisionAttributes": sla
        });
     },

     lambda_failure_details: function (lambdaId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
        var evt = this._events[i];
        if (evt.eventType === "LambdaFunctionFailed") {
          if (this.lambdaIdFor(evt.lambdaFunctionFailedEventAttributes.scheduledEventId) === lambdaId) {
            var details = evt.lambdaFunctionFailedEventAttributes.details || evt.lambdaFunctionFailedEventAttributes.reason;
            if (!details) {
              this.logger.warn("Received a lambdaFunctionFailed without details or reason", evt);
              return "Lambda function failed for an unknown reason";
            }
            try {
              var d = JSON.parse(details);
              return d.errorMessage || d;
            } catch (ex) {
              this.logger.warn("Received a lambdaFunctionFailed with non JSON failure details", evt);
              return details;
            }
          }
        }
      }
      return null;
     },

     lambda_timedout_details: function (lambdaId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
        var evt = this._events[i];
        /**
         * When using lambda functions for activities and the lambda call times out, SWF is not
         * returning a LambdaFunctionTimedOut event, but instead a LambdaFunctionFailed with
         * lambdaFunctionFailedEventAttributes:
         *   reason:"UnhandledError"
         *   details:"{\\"errorMessage\\":\\"2016-04-26T10:51:11.747Z c874300c-0b9c-11e6-8488-7d4bb8336730 Task timed out after 3.00 seconds\\"}"
         * But, in case this gets fixed some day, catch also LambdaFunctionTimedOut events
         */
        if (evt.eventType === "LambdaFunctionTimedOut") {
          if (this.lambdaIdFor(evt.lambdaFunctionTimedOutEventAttributes.scheduledEventId) === lambdaId) {
            return "Lambda function timed out with timeoutType=" + evt.lambdaFunctionTimedOutEventAttributes.timeoutType;
          }
        } else if (evt.eventType === "LambdaFunctionFailed") {
          if (this.lambdaIdFor(evt.lambdaFunctionFailedEventAttributes.scheduledEventId) === lambdaId) {
            if (evt.lambdaFunctionFailedEventAttributes.details.indexOf("Task timed out") >= 0) {
              return "Lambda function timed out";
            }
          }
        }
      }
     },

     fail: function (stopAttributes, swfAttributes) {
      var sa = swfAttributes || {};

      // Result
      if(stopAttributes.details) {
        if (typeof stopAttributes.details === 'function') {
          sa.details = stopAttributes.details();
        }
        else {
          sa.details = stopAttributes.details;
        }
      }
      if(typeof sa.details !== 'string') {
        sa.details = JSON.stringify(sa.details);
      }
      if (stopAttributes.reason) {
        sa.reason = stopAttributes.reason;
      }

      this.addDecision({
        "decisionType": "FailWorkflowExecution",
        "failWorkflowExecutionDecisionAttributes": sa
      });
     },

     lambda: function (scheduleAttributes) {

       var that = this;
         return function(cb) {
             if( that.is_lambda_scheduled(scheduleAttributes.id) ) {
                 if( that.has_lambda_completed(scheduleAttributes.id) ) {
                     cb(null, that.lambda_results(scheduleAttributes.id) );
                 } else if( that.has_lambda_timedout(scheduleAttributes.id) ) {
                     cb(that.lambda_timedout_details(scheduleAttributes.id));
                 } else if( that.has_lambda_failed(scheduleAttributes.id) ) {
                     cb(that.lambda_failure_details(scheduleAttributes.id) );
                 }
                 else {
                     this.logger.debug("waiting for "+scheduleAttributes.id+" lambda to complete.");
                     that.wait();
                 }
             }
             else {
                 this.logger.debug("scheduling "+scheduleAttributes.id);
                 //that.schedule(scheduleAttributes, swfAttributes);
                 var sla = {
                   id: scheduleAttributes.id,
                   name: scheduleAttributes.name,
                   input: scheduleAttributes.input,
                   startToCloseTimeout: scheduleAttributes.startToCloseTimeout
                 };

                 if(typeof sla.input !== "string") {
                   sla.input = JSON.stringify(scheduleAttributes.input);
                 }

                that.addDecision({
                   "decisionType": "ScheduleLambdaFunction",
                   "scheduleLambdaFunctionDecisionAttributes": sla
                });
             }
         };

     },

   /**
    * Add a new ScheduleActivityTask decision
    * @param {Object} scheduleAttributes
    * @param {Object} [swfAttributes] - Additional attributes for 'scheduleActivityTaskDecisionAttributes'
    */
    schedule: function (scheduleAttributes, swfAttributes) {

      var ta = swfAttributes || {};

      ta.activityId = scheduleAttributes.name; // scheduleAttributes.name required

      // Activity Type
      if(scheduleAttributes.activity) {
         ta.activityType = scheduleAttributes.activity;
      }
      if (typeof ta.activityType === "string") {
         ta.activityType = { name: ta.activityType, version: "1.0" };
      }

      // Activity Input
      if (scheduleAttributes.input) {
         if (typeof scheduleAttributes.input === 'function') {
            ta.input = scheduleAttributes.input();
         }
         else {
            ta.input = scheduleAttributes.input;
         }
      }
      else {
         ta.input = "";
      }

      if (typeof ta.input !== "string") {
         ta.input = JSON.stringify(ta.input);
      }

      // Task list (if not set, use the default taskList)
      if (!ta.taskList && this.defaultTaskList) {
          ta.taskList = this.defaultTaskList;
      }
      if (ta.taskList && typeof ta.taskList === "string") {
         ta.taskList = { name: ta.taskList};
      }

      // TODO: we should be able to override these defaults :
      if (!ta.scheduleToStartTimeout) {
        ta.scheduleToStartTimeout = scheduleAttributes.scheduleToStartTimeout || "60";
      }
      if (!ta.scheduleToCloseTimeout) {
        ta.scheduleToCloseTimeout = scheduleAttributes.scheduleToCloseTimeout || "360";
      }
      if (!ta.startToCloseTimeout) {
        ta.startToCloseTimeout = scheduleAttributes.startToCloseTimeout || "300";
      }
      if (!ta.heartbeatTimeout) {
        ta.heartbeatTimeout = scheduleAttributes.heartbeatTimeout || "60";
      }

      this.addDecision({
         "decisionType": "ScheduleActivityTask",
         "scheduleActivityTaskDecisionAttributes": ta
      });
   },

   /**
    * Schedule Lambda Function
    * @param {String} timerId
    */
   cancel_timer: function(timerId) {
      this.addDecision({
         "decisionType": "CancelTimer",
         "cancelTimerDecisionAttributes": {
            "timerId": timerId.toString()
         }
      });
   },

   /**
    * Add a RecordMarker decision
    * @param {String} markerName
    * @param {String} [details]
    */
    add_marker: function (markerName, details) {

      if (typeof markerName !== 'string') {
         markerName = markerName.toString();
      }

      if (typeof details !== 'string') {
         details = details.toString();
      }

      this.addDecision({
         "decisionType": "RecordMarker",
         "recordMarkerDecisionAttributes": {
            "markerName": markerName,
            "details": details
         }
      });
    },


   /**
    * Add a StartChildWorkflowExecution decision
    * @param {Object} startAttributes
    * @param {Object} [swfAttributes] - Additional attributes for 'startChildWorkflowExecutionDecisionAttributes'
    */
   start_childworkflow: function(startAttributes, swfAttributes) {
      var sa = swfAttributes || {};

      // control
      sa.control = startAttributes.name;

      // workflowType
      if(startAttributes.workflow) {
         sa.workflowType = startAttributes.workflow;
      }
      if(typeof sa.workflowType === 'string') {
         sa.workflowType = {
            name: sa.workflowType,
            version: "1.0"
         };
      }

      if( !sa.input ) {
        sa.input = "";
      }

      if (typeof sa.input !== "string") {
         sa.input = JSON.stringify(sa.input);
      }

      if(!sa.workflowId) {
         sa.workflowId = String(Math.random()).substr(2);
      }

      this.addDecision({
         "decisionType": "StartChildWorkflowExecution",
         "startChildWorkflowExecutionDecisionAttributes": sa
      });
   },


   /**
    * Add a new StartTimer decision
    * @param {Object} startAttributes
    * @param {Object} [swfAttributes] - Additional attributes for 'startTimerDecisionAttributes'
    */
   start_timer: function(startAttributes, swfAttributes) {

      var sa = swfAttributes || {};

      // control
      sa.control = startAttributes.name;

      if(startAttributes.delay) {
         sa.startToFireTimeout = String(startAttributes.delay);
      }
      if(!sa.startToFireTimeout) {
         sa.startToFireTimeout = "1";
      }

      if(!sa.timerId) {
         sa.timerId = String(Math.random()).substr(2);
      }

      this.addDecision({
         "decisionType": "StartTimer",
         "startTimerDecisionAttributes": sa
      });
   },

   /**
    * Cancel a Timer
    * @param {String} timerId
    */
   cancel_timer: function(timerId) {
      this.addDecision({
         "decisionType": "CancelTimer",
         "cancelTimerDecisionAttributes": {
            "timerId": timerId.toString()
         }
      });
   },

   /**
    * Cancel an activity task
    * @param {String} activityId
    */
   request_cancel_activity_task: function (activityId) {
      this.addDecision({
         "decisionType": "RequestCancelActivityTask",
         "requestCancelActivityTaskDecisionAttributes": {
            "activityId": activityId
         }
      });
    },

   /**
    * Signal a workflow execution
    * @param {Object} [swfAttributes] - Additionnal attributes for 'signalExternalWorkflowExecutionDecisionAttributes'
    */
   signal_external_workflow: function (swfAttributes) {
      var sa = swfAttributes || {};
      this.addDecision({
        "decisionType": "SignalExternalWorkflowExecution",
        "signalExternalWorkflowExecutionDecisionAttributes": sa
      });
    },

    /**
     * Send a RequestCancelExternalWorkflowExecution
     * @param {String} workflowId
     * @param {String} runId
     * @param {String} control
     */
    request_cancel_external_workflow: function (workflowId, runId, control) {
      this.addDecision({
        "decisionType": "RequestCancelExternalWorkflowExecution",
        "requestCancelExternalWorkflowExecutionDecisionAttributes": {
            "workflowId": workflowId,
            "runId": runId,
            "control": control
        }
      });
    },

    /**
     * Cancel a workflow execution
     * @param {String} details
     */
    cancel_workflow: function (details) {
        this.addDecision({
          "decisionType": "CancelWorkflowExecution",
          "cancelWorkflowExecutionDecisionAttributes": {
            "details": details
          }
        });
    },

    /**
     * Continue as a new workflow execution
     * @param {Object} [swfAttributes] - Additionnal attributes for 'continueAsNewWorkflowExecutionDecisionAttributes'
     */
    continue_as_new_workflow: function (swfAttributes) {
      var sa = swfAttributes || {};
      this.addDecision({
        'decisionType': 'ContinueAsNewWorkflowExecution',
        'continueAsNewWorkflowExecutionDecisionAttributes': sa
      });
    },




    // Method to wrap a "schedule" call in a closure, which returns immediatly if it has results
    // This prevents a lot of the inspection of the event list in the decider code
    activity: function(scheduleAttributes, swfAttributes) {
      var that = this;
        return function(cb) {
            if( that.is_activity_scheduled(scheduleAttributes.name) ) {
                if( that.has_activity_completed(scheduleAttributes.name) ) {
                    cb(null, that.results(scheduleAttributes.name) );
                }
                else {
                    this.logger.debug("waiting for "+scheduleAttributes.name+" to complete.");
                    that.wait();
                }
            }
            else {
                this.logger.debug("scheduling "+scheduleAttributes.name);
                that.schedule(scheduleAttributes, swfAttributes);
            }
        };
    },

    timer: function (startAttributes, swfAttributes) {
      var that = this;
        return function (cb) {
                if(that.timer_scheduled(swfAttributes.timerId)) {
                    if( that.timer_fired(swfAttributes.timerId) ) {
                        cb(null);
                    }
                    else {
                        this.logger.debug("waiting for timer "+swfAttributes.timerId+" to complete");
                    }
                }
                else {
                    this.logger.debug("starting timer "+swfAttributes.timerId);
                    that.start_timer(startAttributes, swfAttributes);
                }
        };
    },

    childworkflow: function (startAttributes, swfAttributes) {
      var that = this;

      return function (cb) {
        if(that.childworkflow_failed(startAttributes.name)) {
          cb(that.childworkflow_failure_details(startAttributes.name));
        } else if(that.childworkflow_scheduled(startAttributes.name)) {
            if(that.childworkflow_completed(startAttributes.name) ) {
                cb(null, that.childworkflow_results(startAttributes.name) );
            }
            else {
                this.logger.debug("waiting for childworkflow "+" to complete");
            }
        }
        else {
            this.logger.debug("starting childworkflow "+startAttributes.name);
            that.start_childworkflow(startAttributes, swfAttributes);
        }
      };
    },




   /**
    * Return the activityId given the scheduledEventId
    * @param {String} scheduledEventId
    * @returns {String} activityId - The activityId if found, false otherwise
    */
   activityIdFor: function (scheduledEventId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];
         if (evt.eventId === scheduledEventId) {
            return evt.activityTaskScheduledEventAttributes.activityId;
         }
      }
      return false;
   },


   lambdaIdFor: function (scheduledEventId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];
         if (evt.eventId === scheduledEventId) {
            return evt.lambdaFunctionScheduledEventAttributes.id;
         }
      }
      return false;
   },

   /**
    * Return the event for a given eventId
    * @param {Integer} eventId
    * @returns {Object} evt - The event if found, false otherwise
    */
   eventById: function (eventId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];
         if (evt.eventId === eventId) {
            return evt;
         }
      }
      return false;
   },


  /**
   * Return the key of event attributes for the given event type
   * @param {String} eventType
   * @returns {String} attributesKey
   */
  _event_attributes_key: function(eventType) {
    return eventType.substr(0, 1).toLowerCase() + eventType.substr(1) + 'EventAttributes';
  },

  /**
   * Return the Event for the given type that has the given attribute value
   * @param {String} eventType
   * @param {String} attributeKey
   * @param {String} attributeValue
   * @returns {Object} evt - The event if found, null otherwise
   */
  _event_find: function(eventType, attributeKey, attributeValue) {
    var attrsKey = this._event_attributes_key(eventType);
    for(var i = 0; i < this._events.length ; i++) {
      var evt = this._events[i];
      if ( (evt.eventType === eventType) && (evt[attrsKey][attributeKey] === attributeValue) ) {
        return evt;
      }
    }
    return null;
  },

  /**
   * Check the presence of an Event with the specified
   * @param {String} attributeKey
   * @param {String} attributeValue
   * @param {String} eventType
   * @returns {Boolean}
   */
  _has_event_with_attribute_value: function(attributeKey, attributeValue, eventType) {
    return !!this._event_find(eventType, attributeKey, attributeValue);
  },

   /**
    * This method returns true if the eventType already occured for the given activityId
    * @param {String} activityId
    * @param {String} eventType
    * @returns {Boolean}
    */
   _has_eventType_for_activityId: function (activityId, eventType) {
      return this._has_event_with_attribute_value('activityId', activityId, eventType);
   },

   _has_eventType_for_lambdaId: function (lambdaId, eventType) {
     return this._has_event_with_attribute_value('id', lambdaId, eventType);
   },


   /**
    * Search for an event with the corresponding type that matches the scheduled activityId
    * @param {String} eventType
    * @param {String} activityId
    * @returns {Boolean}
    */
   _has_event_for_scheduledEventId: function(eventType, activityId) {
      var attrsKey = this._event_attributes_key(eventType);
      return this._events.some(function (evt) {
          if (evt.eventType === eventType) {
             if (this.activityIdFor(evt[attrsKey].scheduledEventId) === activityId) {
                return true;
             }
          }
       }, this);
   },

   _has_event_for_lambdaScheduledEventId: function(eventType, activityId) {
      var attrsKey = this._event_attributes_key(eventType);
      var eventId;
      var ret = this._events.some(function (evt) {
          if (evt.eventType === eventType) {
             if (this.lambdaIdFor(evt[attrsKey].scheduledEventId) === activityId) {
                eventId = evt.eventId;
                return true;
             }
          }
      }, this);
      return ret ? eventId : false;
   },

   /**
    * Return true if the timer with the given timerId has an event with the given eventType
    * @param {String} timerId
    * @param {String} eventType
    * @returns {Boolean}
    */
   has_timer_event: function (timerId, eventType) {
      return this._has_event_with_attribute_value('timerId', timerId, eventType);
    },

   /**
    * Return true if the timer has been canceled
    * @param {String} timerId
    * @returns {Boolean}
    */
   timer_canceled: function (timerId) {
      return this.has_timer_event(timerId, 'TimerCanceled');
   },

   /**
    * Return true if the timer has been canceled
    * @param {String} timerId
    * @returns {Boolean}
    */
   timer_fired: function (timerId) {
      return this.has_timer_event(timerId, 'TimerFired');
   },

   /**
    * Return true if the timer has been started
    * @param {String} timerId
    * @returns {Boolean}
    */
   timer_scheduled: function (timerId) {
      return this.has_timer_event(timerId, 'TimerStarted');
   },


   /**
    * lookup for StartChildWorkflowExecutionInitiated
    * @param {String} control
    * @returns {Boolean}
    */
   childworkflow_scheduled: function(control) {
      var ret = this._events.some(function (evt) {
         if (evt.eventType === "StartChildWorkflowExecutionInitiated") {
            if (evt.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {
               return true;
            }
         }
      });
      this.logger.debug('childworkflow_scheduled('+control+') ? => ', ret);
      return ret;
   },

   /**
    * Return true if the child workflow is completed
    * @param {String} control
    * @returns {Boolean}
    */
   childworkflow_completed: function(control) {
      var completedEventId;
      var ret = this._events.some(function (evt) {
         if (evt.eventType === "ChildWorkflowExecutionCompleted") {
            var initiatedEventId = evt.childWorkflowExecutionCompletedEventAttributes.initiatedEventId;
            var initiatedEvent = this.eventById(initiatedEventId);

            if (initiatedEvent.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {
              completedEventId = evt.eventId;
              return true;
            }
         }
      }, this);
      this.logger.debug('childworkflow_completed('+control+') ? => ', ret);
      return ret ? completedEventId : false;
   },

   /**
    * Return true if the child workflow has failed
    * @param {String} control
    * @returns {Boolean}
    */
   childworkflow_failed: function(control) {
      var initiatedEventId, initiatedEvent, failedEventId;
      var ret = this._events.some(function (evt) {
         if (evt.eventType === "StartChildWorkflowExecutionFailed") {
            initiatedEventId = evt.startChildWorkflowExecutionFailedEventAttributes.initiatedEventId;
            // If the child failed with cause=WORKFLOW_TYPE_DOES_NOT_EXIST, the initiatedEventId is 0
            // and we cannot know if the failed child workflow is the one requested
            if (!initiatedEventId) {
              this.logger.error("Child workflow failed - " + evt.startChildWorkflowExecutionFailedEventAttributes.cause, evt)
              failedEventId = evt.eventId;
              return true;
            }
            initiatedEvent = this.eventById(initiatedEventId);
            if (initiatedEvent.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {
              failedEventId = evt.eventId;
              return true;
            }
         } else if (evt.eventType === "ChildWorkflowExecutionFailed") {
            initiatedEventId = evt.childWorkflowExecutionFailedEventAttributes.initiatedEventId;
            initiatedEvent = this.eventById(initiatedEventId);
            if (initiatedEvent.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {
              failedEventId = evt.eventId;
              return true;
            }
         }
      }, this);
      this.logger.debug('childworkflow_failed('+control+') ? => ', ret);
      return ret ? failedEventId: false;
   },

   childworkflow_failure_details: function (control) {
      var initiatedEventId, initiatedEvent;
      for (var i = 0; i < this._events.length; i++) {
        var evt = this._events[i];
        if (evt.eventType === "StartChildWorkflowExecutionFailed") {
          initiatedEventId = evt.startChildWorkflowExecutionFailedEventAttributes.initiatedEventId;
          // If the child failed with cause=WORKFLOW_TYPE_DOES_NOT_EXIST, the initiatedEventId is 0
          // and we cannot know if the failed child workflow is the one requested
          if (!initiatedEventId) {
            return evt.startChildWorkflowExecutionFailedEventAttributes.cause;
          }
          initiatedEvent = this.eventById(initiatedEventId);
          if (initiatedEvent.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {
            return evt.startChildWorkflowExecutionFailedEventAttributes.cause;
          }
        } else if (evt.eventType === "ChildWorkflowExecutionFailed") {
          initiatedEventId = evt.childWorkflowExecutionFailedEventAttributes.initiatedEventId;
          initiatedEvent = this.eventById(initiatedEventId);
          if (initiatedEvent.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {
             return evt.childWorkflowExecutionFailedEventAttributes.reason;
          }
        }
      }
   },

   /**
    * returns true if the activityId started
    * @param {String} activityId
    * @returns {Boolean}
    */
   is_activity_started: function (activityId) {
      return this._has_eventType_for_activityId(activityId, "ActivityTaskStarted");
   },

   /**
    * returns true if the activityId has timed out
    * @param {String} activityId
    * @returns {Boolean}
    */
   has_activity_timedout: function (activityId) {
      return this._has_event_for_scheduledEventId('ActivityTaskTimedOut', activityId);
   },

   /**
    * returns true if the activityId has failed
    * @param {String} activityId
    * @returns {Boolean}
    */
   has_activity_failed: function (activityId) {
      return this._has_event_for_scheduledEventId('ActivityTaskFailed', activityId);
   },

   /**
    * Check if one of the ScheduleActivityTask failed
    * @param {String} activityId
    * @returns {Boolean}
    */
   has_schedule_activity_task_failed: function (activityId) {
      return this._has_event_for_scheduledEventId('ScheduleActivityTaskFailed', activityId);
   },


   /**
    * Returns true if the arguments failed
    * @param {String} activityId
    * @returns {Boolean}
    */
   failed: function (activityId) {
      return this.has_activity_failed(activityId) ||
             this.has_schedule_activity_task_failed(activityId);
   },

   /**
    * Returns true if the activityId timed out
    * @param {String} activityId
    * @returns {Boolean}
    */
   timed_out: function (activityId) {
      return this.has_activity_timedout(activityId);
   },

   /**
    * Returns true if there is some event of given type
    * @param {String} signalName
    * @returns {Boolean}
    */
   has_some_event_of_type: function (eventType) {
      for(var i = 0; i < this._events.length ; i++) {
        if (this._events[i].eventType == eventType) {
          return i;
        }
      }
      return null;
   },

   /**
    * Returns true if the signal has arrived
    * @param {String} signalName
    * @returns {Boolean}
    */
   signal_arrived: function (signalName) {
      return this._has_event_with_attribute_value('signalName', signalName, 'WorkflowExecutionSignaled')
    },

    /**
    * Returns the signal input or null if the signal is not found or doesn't have JSON input
    * @param {String} signalName
    * @returns {Mixed}
    */
   signal_input: function (signalName) {

      var evt = this._event_find('WorkflowExecutionSignaled', 'signalName', signalName);
      if(!evt) {
        return null;
      }

      var signalInput = evt.workflowExecutionSignaledEventAttributes.input;
      try {
        var d = JSON.parse(signalInput);
        return d;
      } catch (ex) {
        return signalInput;
      }
   },


   /**
    * returns true if the activityId is canceled
    * @param {String} activityId
    * @returns {Boolean}
    */
   is_activity_canceled: function (activityId) {
      return this._has_eventType_for_activityId(activityId, "ActivityTaskCanceled");
   },

   /**
    * returns true if the activityId is scheduled
    * @param {String} activityId
    * @returns {Boolean}
    */
   is_activity_scheduled: function (activityId) {
      return this._has_eventType_for_activityId(activityId, "ActivityTaskScheduled");
   },


   is_lambda_scheduled: function (lambdaId) {
     var ret = this._has_event_with_attribute_value('id', lambdaId, "LambdaFunctionScheduled");
     this.logger.debug('is_lambda_scheduled('+lambdaId+') ? => ', ret);
     return ret;
   },

   has_lambda_failed: function (lambdaId) {
      var ret = this._has_event_for_lambdaScheduledEventId('LambdaFunctionFailed', lambdaId);
      this.logger.debug('has_lambda_failed('+lambdaId+') ? => ', ret);
      return ret;
   },

   has_lambda_timedout: function (lambdaId) {
      var ret = this._has_event_for_lambdaScheduledEventId('LambdaFunctionTimedOut', lambdaId);

      if (!ret) {
        /**
         * When using lambda functions for activities and the lambda call times out, SWF is not
         * returning a LambdaFunctionTimedOut event, but instead a LambdaFunctionFailed
         */
        var failedEventId = this._has_event_for_lambdaScheduledEventId('LambdaFunctionFailed', lambdaId);
        if (failedEventId) {
          for (i = 0; i < this._events.length; i++) {
             var evt = this._events[i];
             if (evt.eventId === failedEventId) {
              if (evt.lambdaFunctionFailedEventAttributes.details.indexOf("Task timed out") >= 0) {
                ret = failedEventId;
              }
             }
          }
        }
      }

      this.logger.debug('has_lambda_timedout('+lambdaId+') ? => ', ret);
      return ret;
   },

   is_lambda_started: function (lambdaId) {
      var ret = this._has_eventType_for_lambdaId(lambdaId, "LambdaFunctionStarted");
      this.logger.debug('has_lambda_completed('+lambdaId+') ? => ', ret);
      return ret;
   },

   has_lambda_completed: function (lambdaId) {
     var ret = this._has_event_for_lambdaScheduledEventId('LambdaFunctionCompleted', lambdaId);
     this.logger.debug('has_lambda_completed('+lambdaId+') ? => ', ret);
     return ret;
   },


   /**
    * Return true if the arguments are all scheduled
    * @param {String} [...]
    * @returns {Boolean}
    */
   scheduled: function () {
      var i;
      for (i = 0; i < arguments.length; i++) {
         if (!this.is_activity_scheduled(arguments[i])) {
            return false;
         }
      }
      return true;
   },

   /**
    * returns true if no Activity has been scheduled yet...
    * @returns {Boolean}
    */
   has_workflow_just_started: function () {
      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];
         var evtType = evt.eventType;
         if (evtType === "ActivityTaskScheduled") {
            return false;
         }
      }
      return true;
   },

   /**
    * alias for has_workflow_just_started
    * @returns {Boolean}
    */
   just_started: function () {
      return this.has_workflow_just_started();
   },

   /**
    * returns true if we have a Completed event for the given activityId
    * @param {String} activityId
    * @returns {Boolean}
    */
   has_activity_completed: function (activityId) {
      return this._has_event_for_scheduledEventId('ActivityTaskCompleted', activityId);
   },

   /**
    * Return true if all the arguments are completed
    * @param {String} [...]
    * @returns {Boolean}
    */
   completed: function () {
      var i;
      for (i = 0; i < arguments.length; i++) {
         if ( ! (this.has_activity_completed(arguments[i]) || this.childworkflow_completed(arguments[i])  || this.timer_fired(arguments[i]) ) ) {
            return false;
         }
      }
      return true;
   },

   /**
    * Get the execution attributes of the workflow
    * @returns {Mixed}
    */
   workflow_execution_attributes: function () {
      return this._events[0].workflowExecutionStartedEventAttributes;
   },

   /**
    * Get the input parameters of the workflow
    * @returns {Mixed}
    */
   workflow_input: function () {
      var wfInput = this._events[0].workflowExecutionStartedEventAttributes.input;

      try {
         var d = JSON.parse(wfInput);
         return d;
      } catch (ex) {
         return wfInput;
      }
   },


   /**
    * Get the results for the given activityId
    * @param {String} activityId
    * @returns {Mixed}
    */
   results: function (activityId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];

         if (evt.eventType === "ActivityTaskCompleted") {
            if (this.activityIdFor(evt.activityTaskCompletedEventAttributes.scheduledEventId) === activityId) {

               var result = evt.activityTaskCompletedEventAttributes.result;

               try {
                  var d = JSON.parse(result);
                  return d;
               } catch (ex) {
                  return result;
               }

            }
         }
      }

      return null;
   },



   lambda_results: function (lambdaId) {
      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];

         if (evt.eventType === "LambdaFunctionCompleted") {
            if (this.lambdaIdFor(evt.lambdaFunctionCompletedEventAttributes.scheduledEventId) === lambdaId) {

               var result = evt.lambdaFunctionCompletedEventAttributes.result;

               try {
                  var d = JSON.parse(result);
                  return d;
               } catch (ex) {
                  return result;
               }

            }
         }
      }

      return null;
   },


   /**
    * Get the results of a completed child workflow
    * @param {String} control
    * @returns {Mixed}
    */
   childworkflow_results: function(control) {

      var i;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];

         if (evt.eventType === "ChildWorkflowExecutionCompleted") {

            var initiatedEventId = evt.childWorkflowExecutionCompletedEventAttributes.initiatedEventId;
            var initiatedEvent = this.eventById(initiatedEventId);

            if (initiatedEvent.startChildWorkflowExecutionInitiatedEventAttributes.control === control) {

               var result = evt.childWorkflowExecutionCompletedEventAttributes.result;

               try {
                  result = JSON.parse(result);
               }
               catch(ex) {}

               return result;
            }
         }
      }

      return null;
   },

   /**
    * Get the details of the last marker with the given name
    * @param {String} markerName
    * @returns {Mixed}
    */
   get_last_marker_details: function (markerName) {
      var i, finalDetail;
      var lastEventId = 0;
      for (i = 0; i < this._events.length; i++) {
         var evt = this._events[i];

         if ((evt.eventType === 'MarkerRecorded') && (evt.markerRecordedEventAttributes.markerName === markerName) && (parseInt(evt.eventId, 10) > lastEventId)) {
            finalDetail = evt.markerRecordedEventAttributes.details;
            lastEventId = evt.eventId;
         }
      }
      return finalDetail;
   },

   /**
    * Get the raw event history
    * @returns {Array}
    */
   get_history: function () {
      return this._events;
   }



};


module.exports = DecisionTask;
