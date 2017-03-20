var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_id && !activity.input.xoauth_requestor_id) {
    activity.error("Invalid parameters", {user_id: 'required'});
    return;
  }

  activity.request(
    'Users',
    'get_user',
    {
      user_id: activity.input.user_id || activity.input.xoauth_requestor_id
    },
    function(result) {
      activity.logger.debug('Successfully read the user details');

      if (!result.obj.is_active) {
        activity.logger.debug('User is already deactivated');
        activity.success(result.obj);
        return;
      }

      activity.request(
        'Users',
        'put_user',
        {
          user_id: activity.input.user_id || activity.input.xoauth_requestor_id,
          user: {
            is_active: false,
            is_deactivating: false
          }
        },
        function(result){
          activity.success(result.obj);
        }
      );
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
