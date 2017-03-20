var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.user_id) {
    workflow.failWorkflow('user_id is required');
  }

  var page = 1;
  do {
    workflow.lambdaActivity({
      id: "getUserProperties_" + page,
      name: "getUserProperties",
      input: Object.assign({}, workflow.input, {
        user_id: workflow.input.user_id,
        fields: id,
        xoauth_requestor_id: workflow.input.user_id,
        limit: workflow.options.limit
      })
    });
    var propertyIds = workflow.activityResult("getUserProperties_" + page);
    if (propertyIds !== undefined && !(propertyIds instanceof Array)) {
      propertyIds = [propertyIds];
    }
    for (var id in propertyIds) {
      var propertyId = propertyIds[id];
      var activityId = "deactivateProperty_" + propertyId;
      workflow.lambdaActivity({
        id: activityId,
        name: "deactivateProperty",
        input: Object.assign({}, workflow.input, {
          property_id: propertyId,
          xoauth_requestor_id: workflow.input.user_id
        })
      });
    }
    page++;
  } while (propertyIds && propertyIds.length == workflow.options.limit);

  workflow.completeWorkflow("ok");
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
