var LIMITS = {
  MAX_EVENT_MSG_SIZE_BYTES: 256000,   // The real max size is 262144, we leave some room for overhead on each message
  MAX_BATCH_SIZE_BYTES: 1000000,      // We leave some fudge factor here too.
  MAX_BATCH_SIZE_COUNT : 100,          // Bigger number means fewer requests to post.
  MAX_RETRIES : 10
};

var _find = require('lodash/find')
    async = require('async')
    config = require('../config/config')
    AWS = require('aws-sdk');

AWS.config = new AWS.Config(config.aws);

var lib = {
    cloudwatchlogs: new AWS.CloudWatchLogs(),
    retries: 0
};

lib.send = function(groupName, streamName, logEvents, cb) {
  // Trying to send a batch before the last completed would cause InvalidSequenceTokenException.
  if (lib._postingEvents || logEvents.length <= 0) {
    return cb(null, 0);
  }

  lib.getToken(groupName, streamName, function(err, token) {
    if (err) {
      return cb(err);
    }

    var entryIndex = 0;
    var bytes = 0;
    while(entryIndex < logEvents.length && entryIndex <= LIMITS.MAX_BATCH_SIZE_COUNT) {
      var ev = logEvents[entryIndex];
      var evSize = ev ? Buffer.byteLength(ev.message, 'utf8') : 0; // Unit tests pass null elements
      // Handle single entries that are too big.
      if(evSize > LIMITS.MAX_EVENT_MSG_SIZE_BYTES) {
        evSize = LIMITS.MAX_EVENT_MSG_SIZE_BYTES;
        ev.message = ev.message.substring(0, evSize); // NOTE: For MBCS this may truncate the string more than needed
        const msgTooBigErr = new Error('Message Truncated because it exceeds the CloudWatch size limit');
        msgTooBigErr.logEvent = ev;
        cb(msgTooBigErr);
      }
      // Make sure batch size does not go above the limits.
      if(bytes + evSize > LIMITS.MAX_BATCH_SIZE_BYTES) break;
      bytes += evSize;
      entryIndex++;
    }

    var payload = {
      logGroupName: groupName,
      logStreamName: streamName,
      logEvents: logEvents.slice(0, entryIndex)
    };
    if (token) payload.sequenceToken = token;

    lib._postingEvents = true;
    lib.retries++;

    lib.cloudwatchlogs.putLogEvents(payload, function(err) {
      lib._postingEvents = false;
      if (err && err.code == 'InvalidSequenceTokenException' && lib.retries < LIMITS.MAX_RETRIES) {
        lib.send(groupName, streamName, logEvents, cb);
      } else {
        if (!err) {
          logEvents.splice(0, entryIndex);
        }
        cb(err, entryIndex);
      }
    });
  });
};

lib.getToken = function(groupName, streamName, cb) {
  async.series([
    lib.ensureGroupPresent.bind(null, groupName),
    lib.getStream.bind(null, groupName, streamName)
  ], function(err, resources) {
    var groupPresent = resources[0],
        stream = resources[1];
    if (groupPresent && stream) {
      cb(err, stream.uploadSequenceToken);
    } else {
      cb(err);
    }
  });
};

lib.ensureGroupPresent = function ensureGroupPresent(name, cb) {
  var params = { logGroupName: name };
  lib.cloudwatchlogs.describeLogStreams(params, function(err, data) {
    if (err && err.code == 'ResourceNotFoundException') {
      return lib.cloudwatchlogs.createLogGroup(params, lib.ignoreInProgress(function(err) {
        cb(err, err ? false : true);
      }));
    } else {
      cb(err, true);
    }
  });
};

lib.getStream = function getStream(groupName, streamName, cb) {
  var params = {
    logGroupName: groupName,
    logStreamNamePrefix: streamName
  };

  lib.cloudwatchlogs.describeLogStreams(params, function(err, data) {
    if (err) return cb(err);

    var stream = _find(data.logStreams, function(stream) {
      return stream.logStreamName === streamName;
    });

    if (!stream) {
      lib.cloudwatchlogs.createLogStream({
        logGroupName: groupName,
        logStreamName: streamName
      }, lib.ignoreInProgress(function(err, data) {
        if (err) return cb(err);
        getStream(groupName, streamName, cb);
      }));
    } else {
      cb(null, stream);
    }
  });
};

lib.ignoreInProgress = function ignoreInProgress(cb) {
  return function(err, data) {
    if (err && (err.code == 'OperationAbortedException' ||
                err.code == 'ResourceAlreadyExistsException')) {
      cb(null, data);
    } else {
      cb(err, data);
    }
  };
};

module.exports = lib;
