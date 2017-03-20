var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  if (!workflow.input.user_id) {
    workflow.failWorkflow('user_id is required');
  }

  var page = 1;
  do {
    workflow.lambdaActivity({
      id: "getPMs_" + page,
      name: "getPMs",
      input: Object.assign({}, workflow.input, {
        user_id: workflow.input.user_id,
        xoauth_requestor_id: workflow.input.user_id,
        limit: workflow.options.limit
      })
    });
    var pmIds = workflow.activityResult("getPMs_" + page);
    if (pmIds !== undefined && !(pmIds instanceof Array)) {
      pmIds = [pmIds];
    }
    for (var i in pmIds) {
      var pmId = pmIds[i];
      var activityId = "deactivateProvider_" + pmId;
      workflow.lambdaActivity({
        id: activityId,
        name: "deactivateProvider",
        input: Object.assign({}, workflow.input, {
          user_id: workflow.input.user_id,
          host_id: pmId,
          xoauth_requestor_id: workflow.input.user_id
        })
      });
    }
    page++;
  } while (pmIds && pmIds.length == workflow.options.limit);

  workflow.completeWorkflow("ok");
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
