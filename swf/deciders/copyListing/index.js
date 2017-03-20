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

  workflow.lambdaActivity({
    id: "copyTo_" + workflow.input.target_listing_id,
    name: "vreasyRequest",
    input: {
      endpoint: workflow.input.listing_id ? 'Listings' : 'Properties',
      action: workflow.input.listing_id ? 'copy_listing' : 'copy_property',
      params: Object.assign(workflow.input, {deactivated: true})
    }
  });

  workflow.completeWorkflow("ok");
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
