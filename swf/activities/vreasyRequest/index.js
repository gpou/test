var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.endpoint) {
    activity.error("Invalid parameters", {endpoint: 'required'});
    return;
  }
  if (!activity.input.action) {
    activity.error("Invalid parameters", {action: 'required'});
    return;
  }

  activity.request(
    activity.input.endpoint,
    activity.input.action,
    activity.removeNulls(activity.input.params || {}),
    function(result) {
      activity.success(result.obj);
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
