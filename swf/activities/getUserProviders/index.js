var Activity = require('./lib/activity')
    _map = require('lodash/map');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_id && !activity.input.xoauth_requestor_id) {
    activity.error("Invalid parameters", {user_id: 'required'});
    return;
  }

  activity.request(
    'Users',
    'get_owned_providers',
    activity.removeNulls({
      user_id: activity.input.user_id || activity.input.xoauth_requestor_id,
      fields: 'user_id',
      limit: activity.input.limit || 100
    }),
    function(result) {
      var providersIds = _map(result.obj, 'user_id');
      activity.success(providersIds);
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
