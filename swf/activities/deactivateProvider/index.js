var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_id && !activity.input.xoauth_requestor_id) {
    activity.error("Invalid parameters", {user_id: 'required'});
    return;
  }
  if (!activity.input.host_id) {
    activity.error("Invalid parameters", {host_id: 'required'});
    return;
  }

  activity.request(
    'Users',
    'post_deactivate_provider',
    {
      user_id: activity.input.user_id || activity.input.xoauth_requestor_id,
      host_id: activity.input.host_id
    },
    function(result) {
      activity.success({deactivated_at: result.obj.deactivated_at});
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
