var Workflow = require('./lib/workflow');

var failures;

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.listing_id && !workflow.input.property_id) {
    workflow.failWorkflow('listing_id or property_id is required');
  }

  if (!workflow.input.target_listing_ids) {
    workflow.failWorkflow('target_listing_ids required');
  }

  if (!workflow.input.fields) {
    workflow.failWorkflow('fields is required');
  }

  workflow.input.target_listing_ids = workflow.input.target_listing_ids || [];

  failures = [];

  var batchSize = workflow.input.batchSize || 5;
  var total = workflow.input.target_listing_ids.length;
  var current = 0;
  do {
    if (!workflow.canContinue()) {
      break;
    }
    asyncActivities = [];
    target_listing_ids = workflow.input.target_listing_ids.slice(current, current + batchSize)
    target_listing_ids.forEach(function(targetId) {
      var getWorkflowActivityId = 'getWorkflow_' + targetId;
      var workflowId = getVreasyWorkflow(workflow, targetId, getWorkflowActivityId);
      asyncActivities.push(getWorkflowActivityId);

      var copyActivityId = "copyListing_" + (workflow.input.listing_id || workflow.input.property_id) + "_" + targetId;
      if (workflowId) {
        copyListing(workflow, workflowId, targetId, copyActivityId);
        asyncActivities.push(copyActivityId);
      }
    })
    workflow.waitForAll(asyncActivities);

    current += batchSize;
  } while (current < total);

  if (workflow.canContinue()) {
    if (failures.length > 0) {
      workflow.failWorkflow('Some child workflows failed', failures);
    } else {
      workflow.completeWorkflow("ok");
    }
  }
}

function getVreasyWorkflow(workflow, targetId, activityId) {
  var activityId = 'getWorkflow_' + targetId;
  var sourceId = workflow.input.listing_id || workflow.input.property_id;
  workflow.lambdaActivityAsync({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'Workflows',
      action: 'get_workflows',
      params: {
        is_active: true,
        workflow_name: 'copyListing',
        workflow_id: 'copyListing_' + sourceId + '_' + targetId,
        resource_id: targetId,
        fields: 'id'
      }
    }
  }, {
    failWorkflowOnFailure: false
  });

  var status = workflow.activityStatus(activityId);
  if (status == 'failed' || status == 'timedout') {
    if (!failures.some(function(failure) {
      return failure.activityId == activityId;
    })) {
      failures.push({activityId: activityId, details: workflow.activityResult(activityId)});
    };
  }

  if (workflow.hasActivityFinished(activityId)) {
    var vreasyWorkflow = workflow.activityResult(activityId);
    if (!vreasyWorkflow || !(vreasyWorkflow instanceof Array) || (vreasyWorkflow.length == 0)) {
      if (!failures.some(function(failure) {
        return failure.activityId == activityId;
      })) {
        failures.push({activityId: activityId, details: 'Could not find the child workflow for ' + targetId});
      };
    } else {
      return vreasyWorkflow[0].id;
    }
  }
}

function copyListing(workflow, workflowId, targetId, activityId) {
  workflow.childWorkflowAsync({
    id: activityId,
    name: activityId,
    workflow: {
      name: "copyListing",
      version: "1.0.0"
    },
    input: {
      listing_id: workflow.input.listing_id,
      property_id: workflow.input.property_id,
      target_listing_id: targetId,
      fields: workflow.input.fields,
      vreasy_workflow_id: workflowId
    },
    workflowId: activityId
  }, {
    failWorkflowOnFailure: false,
    retries: false
  });

  var status = workflow.activityStatus(activityId);
  if (status == 'failed' || status == 'timedout') {
    if (!failures.some(function(failure) {
      return failure.activityId == activityId;
    })) {
      failures.push({activityId: activityId, details: workflow.activityResult(activityId)});
    };
  }
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
