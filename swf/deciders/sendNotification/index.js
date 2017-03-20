var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {

  if (!workflow.input.vreasyEvent) {
    workflow.failWorkflow('event is required');
  }

  if (!workflow.input.vreasyEvent.resource_id) {
    workflow.failWorkflow('resource_id is required');
  }

  if (!workflow.input.vreasyEvent.event) {
    workflow.failWorkflow('event name is required');
  }

  if (!workflow.input.vreasyEvent.resource_type) {
    workflow.failWorkflow('event resource type is required');
  }

  if (!workflow.input.delay) {
    workflow.failWorkflow('delay is required');
  }

  workflow.activityTimer({
    id: "notify_" + workflow.input.vreasyEvent.event
      + '_' + workflow.input.vreasyEvent.resource_type
      + "_" + workflow.input.vreasyEvent.resource_id,
    activity: "sendNotification",
    delay: new String(workflow.input.delay),
    input: workflow.input
  });

  workflow.completeWorkflow("ok");
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
