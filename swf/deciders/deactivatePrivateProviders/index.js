var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.user_id) {
    workflow.failWorkflow('user_id is required');
  }

  var page = 1;
  do {
    workflow.lambdaActivity({
      id: "getUserProviders_" + page,
      name: "getUserProviders",
      input: Object.assign({}, workflow.input, {
        xoauth_requestor_id: workflow.input.user_id,
        limit: workflow.options.limit
      })
    });
    var providerIds = workflow.activityResult("getUserProviders_" + page);
    if (providerIds !== undefined && !(providerIds instanceof Array)) {
      providerIds = [providerIds];
    }
    for (var i in providerIds) {
      var providerId = providerIds[i];
      var activityId = "disableUserAccount_" + providerId;
      workflow.childWorkflow({
        name: activityId,
        workflow: {
          name: "disableUserAccount",
          version: "1.0.2"
        },
        input: Object.assign({}, workflow.input, {
          user_id: providerId,
          xoauth_requestor_id: providerId
        }),
        workflowId: activityId
      });
    }
    page++;
  } while (providerIds && providerIds.length == workflow.options.limit);

  workflow.completeWorkflow("ok");
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
