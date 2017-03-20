var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  var failures = 0;
  var failureDetails = [];
  var page = 1;
  var workflowResult = null;
  var workflowId = null;

  workflow.input.limit = workflow.input.limit || 20;

  do {
    workflowId = "getPageEnquiryAutomations_" + page;

    workflow.childWorkflow({
      workflowId: workflowId,
      name: "getPageEnquiryAutomations_" + page,
      workflow: {
        name: "getPageEnquiryAutomations",
        version: "1.0.1"
      },
      input: workflow.input
    });

    if (!workflow.canContinue()) return;

    workflowResult = workflow.activityResult(workflowId);

    failures = failures + workflowResult.failures;
    failureDetails = failureDetails.concat(workflowResult.failureDetails);

    page++;
  } while (workflowResult &&
           workflowResult.failures < workflow.input.limit &&
           workflowResult.processed == workflow.input.limit);

  if (failures > 0){
    workflow.failWorkflow(JSON.stringify(failureDetails));
  }else{
    workflow.completeWorkflow("ok");
  }
};

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);
  workflow.run(deciderFunction);
};
