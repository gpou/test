var lib = {
    cloudwatchlogs: new AWS.CloudWatchLogs()
};

lib.send = function(groupName, streamName, logEvents, cb) {
  logEvents.forEach(function(evt) {
    console.log("            *** " + evt.message);
  })
  cb(null, logEvents.length);
};

module.exports = lib;
