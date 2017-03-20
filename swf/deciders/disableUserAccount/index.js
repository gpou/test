var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.user_id) {
    workflow.failWorkflow('user_id is required');
  }

  workflow.lambdaActivityAsync({
    id: "removeUserSession",
    name: "removeUserSession",
    input: Object.assign({}, workflow.input, { xoauth_requestor_id: workflow.input.user_id })
  });
  workflow.lambdaActivityAsync({
    id: "disableUser",
    name: "disableUser",
    input: Object.assign({}, workflow.input, { xoauth_requestor_id: workflow.input.user_id })
  });
  workflow.waitForAll(["removeUserSession", "disableUser"]);

  if (!workflow.canContinue()) return;
  var user = workflow.activityResult("disableUser");
  if (user.roles == "host") {
    workflow.childWorkflow({
      name: "deactivatePrivateProviders",
      workflow: {
        name: "deactivatePrivateProviders",
        version: "1.0.1"
      },
      input: workflow.input,
      workflowId: "deactivatePrivateProviders_" + workflow.input.user_id
    });
    workflow.childWorkflow({
      name: "deactivateHostProperties",
      workflow: {
        name: "deactivateHostProperties",
        version: "1.0.0"
      },
      input: workflow.input,
      workflowId: "deactivateHostProperties_" + workflow.input.user_id
    })
  } else {
    workflow.childWorkflow({
      name: "disassociateProviderFromPMs",
      workflow: {
        name: "disassociateProviderFromPMs",
        version: "1.0.0"
      },
      input: workflow.input,
      workflowId: "disassociateProviderFromPMs_" + workflow.input.user_id
    });
  }

  workflow.lambdaActivity({
    id: "deactivateUser",
    name: "deactivateUser",
    input: Object.assign({}, workflow.input, { xoauth_requestor_id: workflow.input.user_id })
  });

  workflow.completeWorkflow("ok");
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
