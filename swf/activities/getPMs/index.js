var Activity = require('./lib/activity')
    _map = require('lodash/map');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_id && !activity.input.xoauth_requestor_id) {
    activity.error("Invalid parameters", {user_id: 'required'});
    return;
  }

  activity.request(
    'Users',
    'get_pms',
    activity.removeNulls({
      user_id: activity.input.user_id || activity.input.xoauth_requestor_id,
      fields: 'host_id',
      limit: activity.input.limit || 100
    }),
    function(result) {
      var pmsIds = _map(result.obj, 'host_id');
      activity.success(pmsIds);
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
