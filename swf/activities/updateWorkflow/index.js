var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.run_id && !activity.input.id) {
    activity.error("Invalid parameters", 'run_id or id required');
    return;
  }

  activity.request(
    'Workflows',
    'get_workflows',
    activity.removeNulls({
      ids: activity.input.id,
      workflow_run_id: activity.input.run_id
    }),
    function(result) {
      activity.logger.debug('Successfully read the workflow details');

      if (result.obj !== undefined && !(result.obj instanceof Array)) {
        result.obj = [result.obj];
      }
      if (result.obj.length == 0) {
        activity.failure("Couldn't find the workflow", result);
      } else {
        var workflow_id = result.obj[0].id;

        var now = activity.nowMock ? new Date(activity.nowMock) : new Date();
        var workflow = activity.input.workflow || {};
        var notes = JSON.parse(result.obj[0].notes || "{}") || [];
        notes.debug = notes.debug || [];
        notes.debug.push({
          date: now,
          status: workflow.status,
          note: activity.input.debug_note
        });
        workflow.notes = JSON.stringify(notes);
        activity.request(
          'Workflows',
          'put_workflow',
          {
            workflow_id: workflow_id,
            workflow: workflow
          },
          function(result){
            activity.success("OK");
          }
        );
      }
    },
    function(error){
      activity.failure("Couldn't read the workflow details", error);
    }
  );
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
