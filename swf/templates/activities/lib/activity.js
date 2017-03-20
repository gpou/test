require('dotenv').config();

var Logger = require('./logger')
    LoggerCloudwatch = require('./logger-cloudwatch')
    Swagger = require('swagger-client')
    OauthAuthorization = require('./oauth_authorization').OauthAuthorization
    config = require('../config/config')
    async = require('async');

var ACTIVITY_CACHE = {}

var Activity = function(event, context, options) {
  this.event = this.input = event;
  this.context = context;
  this.options = Object.assign({}, this.event.options || {}, options);

  this.logger = new Logger({
    logLevel: this.options.log_level,
    transport: this.options.logTransport || LoggerCloudwatch
  });
};

Activity.prototype = {

  run: function(activityFunction, cb) {
    this.callback = cb;
    var _this = this;
    var series = [];

    series.push(function(callback) {
      _this.setup(callback);
    });

    series.push(function(callback) {
      // Save the callback of this serie in order for the activity to be able to call it when
      // the activity function calls success, failure or error
      _this.activityFunctionCallback = callback;
      activityFunction(_this);
    });

    async.series(series, function(err, response) {
      // Once all the series have been run, flush the logger and either call the main callback
      // function (used when testing) or call the context.fail / context.succeed for real lambda executions
      _this.logger.flush(function() {
        if (cb) {
          cb(err, response[1]);
        } else {
          if (err) {
            _this.context.fail(err);
          } else {
            _this.context.succeed(response[1]);
          }
        }
      });
    });
  },

  setup: function(cb) {
    // Initialize the logger
    this.log_level = this.options.log_level;
    this.logger.setLogLevel(this.log_level);
    this.logger.setContext({
      functionType: 'activity',
      functionName: this.getFunctionName(),
      domain: this.getAlias(),
      mainWorkflowRunId: this.options.main_workflow_run_id,
      workflowRunId: this.options.workflow_run_id,
      mainWorkflowId: this.options.main_workflow_id,
      workflowId: this.options.workflow_id
    });

    // Initialize swagger in order to be able to make the requests to the Vreasy api
    if (ACTIVITY_CACHE.swagger) {
      this.resource = ACTIVITY_CACHE.swagger;
      this.logger.info("Loaded swagger from cache and setting host to "+this.getHost()+" and protocol to "+this.getProtocol());
      // We are caching the swagger client, so we must overwride the host and protocol with the
      // ones corresponding to the environment
      this.resource.setHost(this.getHost());
      this.resource.setSchemes([this.getProtocol()]);
      cb();
    } else if (this.options.swaggerSpec) {
      // When testing, we will send a swaggerSpec attribute containing the swagger json
      // Then, all the needed requests will be mocked on the tests
      this.resource = new Swagger({
        url: 'http://foo.bar',
        spec: {}
      });
      this.resource.buildFromSpec(this.options.swaggerSpec);
      ACTIVITY_CACHE.swagger = this.resource;
      this.logger.info("Loaded swagger from local spec");
      cb();
    } else {
      // On real executions, the swagger json will be retrieved from the server
      var _this = this;
      _this.logger.info("Loading swagger data from "+this.getProtocol() + "://" + this.getHost() + "/docs/swagger.json");
      var swagger = new Swagger({
        url: this.getProtocol() + "://" + this.getHost() + "/docs/swagger.json",
        authorizations: {
          oauth: new OauthAuthorization(process.env.VREASY_OAUTH_KEY, process.env.VREASY_OAUTH_SECRET)
        },
        scheme: this.getProtocol(),
        usePromise: true
      }).then(function(client) {
        _this.resource = client;
        _this.logger.info("Finished swagger setup");
        ACTIVITY_CACHE.swagger = client;
        cb();
      }).catch(function(error) {
        _this.logger.crit("Failed to setup swagger");
        cb(error);
      });
    }
  },

  // The following methods (success, failure and error) will be called from the main activity function,
  // which in turn is called from Activity:run, inside of a series of sync methods.
  // activityFunctionCallback contains the callback function of the serie item that runs the main
  // activity function, so we need to call it in order for the serie to complete
  success: function(response) {
    this.logger.info("Activity completed", response);
    this.activityFunctionCallback(null, response);
  },
  failure: function(message, details) {
    if (details.obj && details.obj.message) {
      message = message + ": " + details.obj.message;
    }
    this.logger.info("Activity failed", {message: message, details: details});
    this.activityFunctionCallback(JSON.stringify({errorMessage: message}));
  },
  error: function(message, details) {
    this.logger.crit("Activity failed", {message: message, details: details});
    this.activityFunctionCallback(JSON.stringify({errorMessage: message}));
  },

  // Get the called lambda function name, which is found on the context attribute
  getFunctionName: function () {
    var attributes = this.getFunctionAttributesFromContext();
    return attributes.functionName;
  },

  // Make a request to the Vreasy api and call successCallback or errorCallback
  // this method is called from the main activity function, and it needs to get the results/errors
  // in order to decide what action will be performed next
  request: function(endpoint, action, params, successCallback, errorCallback) {
    if (!this.resource[endpoint] || !this.resource[endpoint][action]) {
      this.error("Invalid request to endpoint " + endpoint + "::" + action);
    } else {
      // Add some default parameters sent on every request to the api
      // (xoauth_requestor_id, operator_id, api_key_id)
      params = this.addDefaultParamsToRequestParams(params);
      var _this = this;
      this.resource[endpoint][action](params)
      .then(function(result) {
        _this.requestResponse(endpoint, action, result, successCallback, errorCallback);
      })
      .catch(function(error) {
        _this.requestError(endpoint, action, error, errorCallback);
      });
    }
  },

  requestResponse: function(endpoint, action, result, successCallback, errorCallback) {
    // If the api request returns a response with a code other than 200/201, it means that
    // an error ocurred
    if (((result.status != 200) && (result.status != 201)) || !result.obj) {
      // The activity function, when making a request, can send an errorCallback or not
      // When the errorCallback is present, it will be the responsibility of the main function
      // to decide what to do next (make another request, fail the activity, etc)
      // If no errorCallback is sent, then we will fail the activity
      if (errorCallback) {
        this.logger.info("Request to " + endpoint + "::" + action + " failed", result);
        errorCallback(result);
      } else {
        this.failure("Request to " + endpoint + "::" + action + " failed", result);
      }
    } else {
      this.logger.info("Request to " + endpoint + "::" + action + " completed", result);
      successCallback(result);
    }
  },

  requestError: function(endpoint, action, error, errorCallback) {
    if (errorCallback) {
      this.logger.info("Request to " + endpoint + "::" + action + " failed", error);
      errorCallback(error);
    } else {
      this.failure("Request to " + endpoint + "::" + action + " failed", error);
    }
  },

  // Get the host for the Vreasy api requests, depending on the lambda alias
  getHost: function (context) {
    var alias = this.getAlias();
    switch(alias) {
      case 'production': return "www.vreasy.com";
      case 'staging': return "stage.vreasy.com";
      default: return alias.substr(11).toLowerCase() + ".vagrant.vreasy.com";
    }
  },

  // Get the protocol for the Vreasy api requests, depending on the lambda alias
  getProtocol: function (context) {
    var alias = this.getAlias();
    switch(alias) {
      case 'production': return "https";
      case 'staging': return "https";
      default: return "http";
    }
  },

  // Add to a params object some default parameters that are sent to every request to the Vreasy api
  addDefaultParamsToRequestParams: function(params) {
    var defaults = {
      xoauth_requestor_id: params.xoauth_requestor_id || this.event.xoauth_requestor_id,
      operator_id: params.operator_id || this.event.operator_id,
      api_key_id: params.api_key_id || this.event.api_key_id
    }
    return Object.assign({}, this.removeNulls(defaults), params);
  },

  // Remove any null attribute from an object (used when sending requests to the Vreasy api)
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

  // Get the alias of the called lambda function from the context
  getAlias: function () {
    var attributes = this.getFunctionAttributesFromContext();
    // If no alias was sent and the invoked function arn does not contain an alias, fail the workflow execution
    if (!attributes.alias) {
      // We cannot use the logger here because it has not yet been instantiated
      var o = {
        logLevel: 'CRITICAL',
        message: "Could not retreive alias from function context",
        details: {
          invokedFunctionArn: this.context.invokedFunctionArn,
          parsedAttributes: attributes
        },
        context: {
          functionType: 'activity',
          functionName: this.getFunctionName(),
          domain: 'unknown',
          mainWorkflowRunId: this.main_workflow_run_id,
          workflowRunId: this.workflow_run_id
        }
      }
      console.log(JSON.stringify(o));
      // Here we cannot use the logger, because the getAlias method is needed in order to initialize it,
      // so directly call the lambda handler callback
      this.callback(JSON.stringify({errorMessage: "Could not retreive alias from function context"}));
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
  }

}

module.exports = Activity;
module.exports.ACTIVITY_CACHE = ACTIVITY_CACHE;
