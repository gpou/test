var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.user_stats_id) {
    activity.error("Invalid parameters", {user_stats_id: 'required'});
    return;
  }
  activity.logger.debug("Updating CSV file on AWS S3");
  activity.request(
    'UserStats',
    'update_csv',
    {
      user_stats_id: activity.input.user_stats_id,
      xoauth_requestor_id: 1
    },
    function(result){
      if (!result.error) {
        updateVreasy(activity);
        return;
      } else {
        activity.failure(result.message);
      }
    }
  );
}

function updateVreasy(activity) {
  activity.logger.debug("Updating sent_at in Vreasy");
  var now = activity.nowMock ? new Date(activity.nowMock) : new Date();

  activity.request(
    'UserStats',
    'put_user_stats',
    {
      user_stats_id: activity.input.user_stats_id,
      xoauth_requestor_id: 1,
      user_stats: {
        sent_at: now
      }
    },
    function(result){
      if (now.getDate() != 1) {
        activity.success(activity.nowMock ? result.obj : 'ok');
        return;
      }
      activity.request(
        'UserStats',
        'reset_user_stats',
        {
          user_stats_id: activity.input.user_stats_id,
          xoauth_requestor_id: 1,
          last_reset: now
        },
        function(result){
          activity.success(activity.nowMock ? result.obj : 'ok');
        }
      );
    }
  );
}

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
