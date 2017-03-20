var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_id && !activity.input.xoauth_requestor_id) {
    activity.error("Invalid parameters", {user_id: 'required'});
    return;
  }

  // TODO
  activity.success("OK");
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
