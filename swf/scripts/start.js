var AWS = require('aws-sdk'),
    config = require('./config');

AWS.config = new AWS.Config(config.aws);
var swfClient = new AWS.SimpleWorkflow();

swfClient.startWorkflowExecution({
   "workflowId": String(Math.random()).substr(2),
   "input": JSON.stringify({user_id: 33994, xoauth_requestor_id: 33575}),
   "domain": config.domain,
   "workflowType": {
      "name": "disableUserAccount",
      "version": "1.0.1"
   },
   "taskList": { "name": "vreasyTaskList" },
   "executionStartToCloseTimeout": "90", // allow 20 minutes for the full workflow execution
   "taskStartToCloseTimeout": "300", // 5 minutes for each task (not sure this will take effect when working with lambda tasks)
   "tagList": ["test"], // in real world we will use this to identify the executions (with user_id, operator_id, agent, ...)
   "childPolicy": "TERMINATE",
   "lambdaRole": "arn:aws:iam::836897382102:role/swf-lambda"
}, function (err, result) {
  if (err) {
    console.log(err)
  } else {
    console.log(result)
  }
})

