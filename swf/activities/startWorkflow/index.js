var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.workflow_name) {
    activity.error("Invalid parameters", {workflow_name: 'required'});
    return;
  }
  activity.request(
    'Workflows',
    'post_workflow',
    {
      workflow: activity.removeNulls({
        workflow_name: activity.input.workflow_name,
        input: activity.input.input,
        notes: activity.input.notes ? JSON.stringify(activity.input.notes) : null
      })
    },
    function(result){
      activity.success(result.obj);
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
