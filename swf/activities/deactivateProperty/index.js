var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.property_id) {
    activity.error("Invalid parameters", {property_id: 'required'});
    return;
  }

  activity.request(
    'Properties',
    'post_property_deactivate',
    {
      property_id: activity.input.property_id
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
