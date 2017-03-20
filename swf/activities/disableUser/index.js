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

      // If the email and phone already start by 'frozen', no need to update the user
      var emailFrozen = (result.obj.email.toLowerCase().indexOf('frozen+') >= 0);
      var phoneFrozen = (result.obj.phone.toString().toLowerCase().indexOf('frozen') >= 0);
      if (emailFrozen && phoneFrozen && !result.obj.is_active) {
        activity.success(result.obj);
        return;
      }

      var params = {
        user_id: activity.input.user_id,
        skip_notifications: 1,
        user: {
          is_deactivating: true
        }
      };
      var now = new Date();
      if (!emailFrozen) {
        params['user']['email'] = 'frozen+' + result.obj.email;
        params['user']['email_verified_at'] = now;
      }
      if (!phoneFrozen) {
        params['user']['phone'] = 'frozen+' + result.obj.phone.toString();
        params['user']['phone_verified_at'] = now;
      }

      if (!emailFrozen) {
        var originalEmail = result.obj.email;
        // If a user already exists with the new email, append an extra +fro000 where 000 is a 3 decimal random integer
        activity.request(
          'Account',
          'check_account',
          {
            email: {email: params['user']['email']}
          },
          function(result) {
            params['user']['email'] = 'frozen+fro' + String(Math.random()).substring(2,5) + '+' + originalEmail;
            updateUser(activity, params);
          },
          function(error) {
            if (error.status == 404) {
              updateUser(activity, params);
            } else {
              activity.failure("Request to Account::check_account failed", error);
            }
          }
        );
      } else {
        updateUser(activity, params);
      }
    }
  );
};

function updateUser(activity, params) {
  activity.request('Users', 'put_user', params, function(result){
    activity.success(result.obj);
  });
}

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
