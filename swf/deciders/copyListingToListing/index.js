var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.listing_id && !workflow.input.property_id) {
    workflow.failWorkflow('listing_id or property_id is required');
  }

  if (!workflow.input.target_listing_id) {
    workflow.failWorkflow('target_listing_id is required');
  }

  if (!workflow.input.fields) {
    workflow.failWorkflow('fields is required');
  }

  var activityId = 'getWorkflow';
  var sourceId = workflow.input.listing_id || workflow.input.property_id;
  workflow.lambdaActivity({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'Workflows',
      action: 'get_workflows',
      params: {
        is_active: true,
        workflow_name: 'copyListing',
        workflow_id: 'copyListing_' + sourceId + '_' + workflow.input.target_listing_id,
        resource_id: workflow.input.target_listing_id,
        fields: 'id'
      }
    }
  });

  if (workflow.canContinue()) {
    var vreasyWorkflow = workflow.activityResult(activityId);
    if (!vreasyWorkflow || !(vreasyWorkflow instanceof Array) || (vreasyWorkflow.length == 0)) {
      workflow.failWorkflow('Could not find the child workflow')
    } else {
      var sourceId = workflow.input.listing_id || workflow.input.property_id;
      var activityId = "copyListing_" + sourceId + "_" + workflow.input.target_listing_id;
      workflow.childWorkflow({
        name: activityId,
        workflow: {
          name: "copyListing",
          version: "1.0.0"
        },
        input: {
          listing_id: workflow.input.listing_id,
          property_id: workflow.input.property_id,
          target_listing_id: workflow.input.target_listing_id,
          fields: workflow.input.fields,
          vreasy_workflow_id: vreasyWorkflow[0].id
        },
        workflowId: activityId
      }, {
        retries: false
      });

      if (workflow.canContinue()) {
        workflow.completeWorkflow("ok");
      }
    }
  }
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
