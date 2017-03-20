var _invert = require('lodash/invert')
    _find = require('lodash/find')
    async = require('async');

var Logger = function(options) {
  this.init(options);
}

Logger.prototype = {
  LOG_LEVELS: {
    crit: 1,
    error: 2,
    warn: 3,
    info: 4,
    debug: 5
  },

  init: function(options) {
    options = options || {};
    this.context = options.context || {};
    this.logLevel = options.logLevel || this.LOG_LEVELS.info;
    this.transport = options.transport;
    this.logEvents = [];
  },

  serializer: function() {
    var stack = [], keys = []

    cycleReplacer = function(key, value) {
      if (stack[0] === value) return "[Circular ~]"
      return "[Circular ~." + keys.slice(0, stack.indexOf(value)).join(".") + "]"
    }

    return function(key, value) {
      if (stack.length > 0) {
        var thisPos = stack.indexOf(this)
        ~thisPos ? stack.splice(thisPos + 1) : stack.push(this)
        ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key)
        if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value)
      }
      else stack.push(value)

      return value;
    }
  },

  getLogGroupName: function() {
    return 'Vreasy_Workflows_' + (this.context.domain || 'unknownDomain');
  },

  getLogStreamName: function() {
    return (this.context.mainWorkflowId || 'unknownExecutionId') + '_' + (this.context.mainWorkflowRunId || 'unknownRunId');
  },

  setContext: function(context) {
    this.context = context;
  },

  setLogLevel: function(logLevel) {
    this.logLevel = logLevel;
  },

  getLogLevel: function(logLevel) {
    return this.logLevel;
  },

  flush: function(cb) {
    if (this.logEvents.length <= 0) {
      return cb();
    }

    var groupName = this.getLogGroupName();
    var streamName = this.getLogStreamName();
    var _this = this;

    this.transport.send(
      groupName,
      streamName,
      this.logEvents,
      function(err, response) {
        if (err) {
          console.log("Error while posting logs");
          console.log(err);
          return cb(err);
        }
        _this.logEvents.splice(0, response);
        if (_this.logEvents.length == 0) {
          cb(err);
        } else {
          _this.flush(cb);
        }
      }
    );
  },

  add: function(level, message, details) {
    if (this.logLevel >= level) {
      var levelStr = _invert(this.LOG_LEVELS)[level];
      var data = {
        logLevel: levelStr
      };
      if (details) {
        data.details = details;
      }
      if (this.context) {
        data.context = this.context;
      }
      var evt = [
        levelStr.toUpperCase(),
        this.context.functionName || "",
        message,
        JSON.stringify(data, this.serializer())
      ].join(' - ');
      this.logEvents.push({
        timestamp: new Date().getTime(),
        message: evt
      });
    }
  },

  debug: function(message, object) {
    this.add(this.LOG_LEVELS.debug, message, object);
  },

  info: function(message, object) {
    this.add(this.LOG_LEVELS.info, message, object);
  },

  warn: function(message, object) {
    this.add(this.LOG_LEVELS.warn, message, object);
  },

  error: function(message, object) {
    this.add(this.LOG_LEVELS.error, message, object);
  },

  crit: function(message, object) {
    this.add(this.LOG_LEVELS.crit, message, object);
  }
}

module.exports = Logger;
module.exports.LOG_LEVELS = Logger.prototype.LOG_LEVELS;
