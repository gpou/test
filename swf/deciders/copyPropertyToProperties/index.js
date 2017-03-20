var Workflow = require('./lib/workflow');

var failures;

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.property_id) {
    workflow.failWorkflow('property_id is required');
  }

  if (!workflow.input.target_property_ids) {
    workflow.failWorkflow('target_property_ids is required');
  }

  workflow.input.listings_to_copy = workflow.input.listings_to_copy || [];

  if (!workflow.input.fields) {
    workflow.failWorkflow('fields is required');
  }

  failures = [];

  workflow.input.target_property_ids.forEach(function(targetId) {
    if (workflow.canContinue()) {
      var workflowId = getVreasyWorkflow(workflow, targetId);
      if (workflowId) {
        copyProperty(workflow, workflowId, targetId);
      }
    }
  });

  if (workflow.canContinue()) {
    if (failures.length > 0) {
      workflow.failWorkflow('Some child workflows failed', failures);
    } else {
      workflow.completeWorkflow("ok");
    }
  }
}

function getVreasyWorkflow(workflow, targetId) {
  var activityId = 'getWorkflow_' + targetId;
  workflow.lambdaActivity({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'Workflows',
      action: 'get_workflows',
      params: {
        is_active: true,
        workflow_name: 'copyPropertyToProperty',
        workflow_id: 'copyPropertyToProperty_' + workflow.input.property_id + '_' + targetId,
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
        failures.push({activityId: activityId, details: 'Coult not find the child workflow for ' + targetId});
      };
    } else {
      return vreasyWorkflow[0].id;
    }
  }
}

function copyProperty(workflow, workflowId, targetId) {
  var activityId = "copyPropertyToProperty_" + workflow.input.property_id + "_" + targetId;
  var listingsToCopy = workflow.input.listings_to_copy.find(function(elm) {
    return (elm.target_property_id == targetId);
  })
  if (listingsToCopy) {
    listingsToCopy = listingsToCopy.listings_to_copy
  }
  workflow.childWorkflow({
    name: activityId,
    workflow: {
      name: "copyPropertyToProperty",
      version: "1.0.1"
    },
    input: {
      property_id: workflow.input.property_id,
      target_property_id: targetId,
      listings_to_copy: listingsToCopy,
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
