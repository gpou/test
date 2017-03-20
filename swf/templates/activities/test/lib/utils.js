var fs = require('fs')
    assert = require('assert')
    _bind = require('lodash/bind')
    _keys = require('lodash/keys')
    Activity = require('../../lib/activity')
    Swagger = require('swagger-client')
    Logger = require('../../lib/logger')
    LoggerConsole = require('../../lib/logger-console');

module.exports = {
  context: null,
  event: null,
  activity: null,
  apiMocks: [],

  setEnvironment: function(activityFunction){
    this.activityFunction = activityFunction;
    this.context = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:836897382102:function:activityMyActivity:circle'
    };

    var swaggerFile = __dirname + '/../../../../swagger.json';
    console.log('   reading swagger from ' + swaggerFile);
    var swaggerSpec = JSON.parse(fs.readFileSync(swaggerFile, 'utf8'));

    this.event = {
      options: {
        main_workflow_run_id: 'mainWorkflowRunId',
        main_workflow_id: 'mainWorkflowExecutionId',
        swaggerSpec: swaggerSpec,
        log_level: Logger.LOG_LEVELS.debug,
        logTransport: LoggerConsole
      }
    };
  },

  runActivity: function(input, mocks, cb) {
    this.activity = new Activity(Object.assign({}, this.event, input), this.context);
    this.buildMocks(mocks);
    var _this = this;
    this.activity.run(
      this.activityFunction,
      cb
    );
  },

  buildMocks: function(mocks) {
    var _this = this;

    this.apiMocks = [];
    mocks.forEach(function(mock) {
      if (mock.endpoint) {
        // Save the mocks for requests to the Vreasy api (will be used later, on the request method mock)
        _this.apiMocks[mock.endpoint] = _this.apiMocks[mock.endpoint] || [];
        _this.apiMocks[mock.endpoint][mock.action] = mock.fn;
      } else {
        // For other properties of the activity, just replace the activity attribute/method with the mock
        _keys(mock).forEach(function(key) {
          _this.activity[key] = mock[key];
        })
      }
    });

    // Mock the request method to return the results defined on the tests
    // Also, upon a request call, check that the endpoint/action exist and the parameters are correct
    this.activity.request = function(endpoint, action, params, successCallback, errorCallback) {
      var group = _this.activity.resource[endpoint];
      var operation = group.operations[action];
      if (!operation) {
        assert.fail(true, false, "request to non-existent Vreasy endpoint " + mock.endpoint + ":" + mock.action);
      } else {
        _this.checkOperationParams(params, operation);
        if (!_this.apiMocks[endpoint] || !_this.apiMocks[endpoint][action]) {
          assert.fail(true, false, "missing mock for Vreasy endpoint " + endpoint + ":" + action);
        } else {
          _this.apiMocks[endpoint][action](
            params,
            function(result) {
              _this.activity.requestResponse(endpoint, action, result, successCallback, errorCallback);
            },
            function(error) {
              _this.activity.requestError(endpoint, action, error, errorCallback);
            }
          );
        }
      }
    }
  },

  /**
   * The mocks array can contain either api calls or any attribute of the activity
   * Ex for an api call mock:
   * {
   *   endpoint: 'Users',
   *   action: 'get_user',
   *   fn: function() {
   *     success({status: 200, obj: { id: 1, user_Id: 1699370 });
   *   }
   * }
   * Ex for another attribute:
   * { nowMock: '2016-02-01 10:00:00' }
   */
  installMocks: function(mocks) {
    var _this = this;
    this.apiMocks = [];
    mocks.forEach(function(mock) {
      if (mock.endpoint) {
        _this.apiMocks[mock.endpoint] = _this.apiMocks[mock.endpoint] || [];
        _this.apiMocks[mock.endpoint][mock.action] = mock.fn;
      } else {
        _keys(mock).forEach(function(key) {
          _this.activity[key] = mock[key];
        })
      }
    });
  },

  checkOperationParams: function(params, operation, skipDefaultParams) {
    // By default, check also the default params that can be sent on any request
    if (!skipDefaultParams) {
      params = Object.assign({}, {
        xoauth_requestor_id: 10,
        operator_id: 11,
        api_key_id: 12
      }, params);
    }
    var operationParameters = operation.parameters || []
    for (var key in params) {
      var found = false;
      for (var i = 0; i < operationParameters.length; i++) {
        if (operation.parameters[i].name == key) {
          found = true;
        }
      }
      if (!found) {
        assert.fail(true, false, "invalid parameter " + key + " for operation " + operation.nickname);
      }
    }
  }

};
