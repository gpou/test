var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  var failures = 0;
  var failureDetails = [];
  var page = 1;
  workflow.input.limit = workflow.input.limit || 50;
  do {
    workflow.childWorkflow({
      name: "sendPageUserStats_"+page,
      workflow: {
        name: "sendPageUserStats",
        version: "1.0.0"
      },
      input: workflow.input,
      workflowId: "sendPageUserStats_" + page
    });
    if (!workflow.canContinue()) return;
    var workflowResult = workflow.activityResult("sendPageUserStats_"+page);
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
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);
  workflow.run(deciderFunction);
}
