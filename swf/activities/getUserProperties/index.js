var Activity = require('./lib/activity')
    _map = require('lodash/map');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_id && !activity.input.xoauth_requestor_id) {
    activity.error("Invalid parameters", {user_id: 'required'});
    return;
  }

  activity.request(
    'Properties',
    'get_properties',
    activity.removeNulls({
      xoauth_requestor_id: activity.input.user_id || activity.input.xoauth_requestor_id,
      fields: 'id',
      pm_deactivating: true,
      limit: activity.input.limit || 100
    }),
    function(result) {
      var propertiesIds = _map(result.obj, 'id');
      activity.success(propertiesIds);
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
