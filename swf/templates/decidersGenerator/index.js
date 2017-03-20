var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  /**
   * Write your input validations here
   *
   * if (!workflow.input.my_input_param) {
   *   workflow.failWorkflow('my_input_param is required');
   * }
   **/

  /**
   * Write your decider logic here
   *
   * workflow.lambdaActivity({
   *   id: "myActivityId",
   *   name: "myActivityName",
   *   input: {activity_param: workflow.input.my_input_param}
   * });
   *
   * workflow.completeWorkflow("ok");
   */
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
}
