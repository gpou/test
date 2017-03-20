var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  // If a list of user_ids is sent, skip the last_sent parameter in order to force send
  // the requested user stats, even if the sent_at field is from today
  if (!workflow.input.user_ids) {
    var currentDate = new Date();
    var dd = currentDate.getDate();
    var mm = currentDate.getMonth()+1;
    var yyyy = currentDate.getFullYear();
    if(dd<10) dd ='0'+dd;
    if(mm<10) mm ='0'+mm;
    currentDate = yyyy+'-'+mm+'-'+dd;
  }

  var results = {
    failures: 0,
    failureDetails: [],
    processed: 0,
  };
  workflow.lambdaActivity({
    "id": "getUserStats",
    "name": "vreasyRequest",
    "input": {
      "endpoint": 'UserStats',
      "action": 'get_user_stats',
      "params": {
        "user_ids": workflow.input.user_ids || null,
        "limit": workflow.input.limit || 50,
        "fields": 'id',
        "last_sent": currentDate
      }
    }
  });
  var pageUserStats = workflow.activityResult("getUserStats");
  if (pageUserStats !== undefined && !(pageUserStats instanceof Array)) {
    pageUserStats = [pageUserStats];
  }

  for (var i in pageUserStats) {
    var userStats = pageUserStats[i];
    var activityId = "sendUserStats_"+userStats.id;
    workflow.lambdaActivity({
      "id": activityId,
      "name": "sendUserStats",
      "input": {
        "user_stats_id": userStats.id
      }
    },{
      failWorkflowOnFailure: false
    });
    var activityStatus = workflow.activityStatus(activityId);
    if (activityStatus == "failed"){
      results.failures++;
      results.failureDetails.push({result: workflow.activityResult(activityId)});
    } else if (activityStatus == "timedout"){
        results.failures++;
        results.failureDetails.push({result: "timed out"});
    }
    results.processed++;
  }
  workflow.completeWorkflow(results);
}

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);
  workflow.run(deciderFunction);
}
