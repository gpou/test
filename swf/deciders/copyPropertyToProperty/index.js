var Workflow = require('./lib/workflow');

var failures;

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.property_id) {
    workflow.failWorkflow('property_id is required');
  }

  if (!workflow.input.target_property_id) {
    workflow.failWorkflow('target_property_id is required');
  }

  workflow.input.listings_to_copy = workflow.input.listings_to_copy || [];

  if (!workflow.input.listings_to_copy) {
    workflow.failWorkflow('listings_to_copy is required');
  }

  if (!workflow.input.fields) {
    workflow.failWorkflow('fields is required');
  }

  failures = [];
  asyncActivities = []

  var activityId = "copyPropertyToProperty_" + workflow.input.property_id + "_" + workflow.input.target_property_id;
  asyncActivities.push(activityId);
  copyProperty(workflow, activityId);

  listingPairs = workflow.input.listings_to_copy || []

  var batchSize = workflow.input.batchSize || 5;
  var total = listingPairs.length + 1;
  var current = 0;
  do {
    if (!workflow.canContinue()) {
      break;
    }

    var loopBatchSize = current > 0 ? batchSize : batchSize - 1;
    batchListingPairs = listingPairs.slice(current, current + loopBatchSize)
    batchListingPairs.forEach(function(pair) {
      var sourceId = pair.source_listing_id || pair.source_property_id;
      var targetId = pair.target_listing_id;
      var activityId = 'getWorkflow_' + targetId;

      var getWorkflowActivityId = 'getWorkflow_' + targetId;
      var workflowId = getVreasyWorkflow(workflow, sourceId, targetId, getWorkflowActivityId);
      asyncActivities.push(getWorkflowActivityId);

      var copyActivityId = "copyListingToListing_" + sourceId + "_" + targetId;
      if (workflowId) {
        copyListing(workflow, workflowId, pair, copyActivityId);
        asyncActivities.push(copyActivityId);
      }
    })
    workflow.waitForAll(asyncActivities);
    asyncActivities = [];

    current += loopBatchSize;
  } while (current < total);

  if (workflow.canContinue()) {
    if (failures.length > 0) {
      workflow.failWorkflow('Some child workflows failed', failures);
    } else {
      workflow.completeWorkflow("ok");
    }
  }
}

function getVreasyWorkflow(workflow, sourceId, targetId, activityId) {
  workflow.lambdaActivityAsync({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'Workflows',
      action: 'get_workflows',
      params: {
        is_active: true,
        workflow_name: 'copyListingToListing',
        workflow_id: 'copyListingToListing_' + sourceId + "_" + targetId,
        resource_id: sourceId,
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

function copyProperty(workflow, activityId) {
  workflow.lambdaActivityAsync({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'Properties',
      action: 'copy_property',
      params: {
        property_id: workflow.input.property_id,
        target_listing_id: workflow.input.target_property_id,
        fields: workflow.input.fields,
        deactivated: true
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
}

function copyListing(workflow, workflowId, params, activityId) {
  var sourceListingId = params.source_listing_id;
  var sourcePropertyId = params.source_property_id;
  var targetId = params.target_listing_id;
  workflow.childWorkflowAsync({
    name: activityId,
    workflow: {
      name: "copyListingToListing",
      version: "1.0.0"
    },
    input: {
      listing_id: sourceListingId,
      property_id: sourcePropertyId,
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

function getCopyListingToListingActivityId(params) {
  var sourceListingId = params.source_listing_id;
  var sourcePropertyId = params.source_property_id;
  var targetId = params.target_listing_id;

  return "copyListingToListing_" + (sourceListingId || sourcePropertyId) + "_" + targetId;
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
