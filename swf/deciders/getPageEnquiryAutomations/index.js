var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  var currentDate = new Date();
  var dd = currentDate.getDate();
  var mm = currentDate.getMonth()+1;
  var yyyy = currentDate.getFullYear();

  if(dd<10) dd ='0'+dd;
  if(mm<10) mm ='0'+mm;
  currentDate = yyyy+'-'+mm+'-'+dd;

  var results = {
    failures: 0,
    failureDetails: [],
    processed: 0,
  };

  var activityId = 'getEnquiryAutomations';

  workflow.lambdaActivity({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'EnquiryAutomations',
      action: 'get_enquiry_automations',
      xoauth_requestor_id: 1,
      params: {
        limit: 20,
        fields: 'id,user_id',
        is_active: true,
        last_run: currentDate
      }
    }
  });

  if (workflow.hasActivityFinished(activityId)) {
    var pageEnquiryAutomations = workflow.activityResult("getEnquiryAutomations");

    if (pageEnquiryAutomations !== undefined && !(pageEnquiryAutomations instanceof Array)) {
      pageEnquiryAutomations = [pageEnquiryAutomations];
    }

    for (var i in pageEnquiryAutomations) {
      var enquiryAutomation = pageEnquiryAutomations[i];
      var failures = 0;
      var failureDetails = [];
      var page = 1;
      var workflowResult = null;
      var workflowId = null;

      do {
        workflowId = "getAllReservationsEnquiryAutomation_" + enquiryAutomation.id + "_" + page;

        workflow.childWorkflow({
          workflowId: workflowId,
          name: "getAllReservationsEnquiryAutomation_" + enquiryAutomation.id + "_" + page,
          workflow: {
            name: "getAllReservationsEnquiryAutomation",
            version: "1.0.1"
          },
          input: Object.assign({}, workflow.input, {
            enquiry_automations_id: enquiryAutomation.id,
            enquiry_user_id: enquiryAutomation.user_id,
            xoauth_requestor_id: workflow.input.user_id || workflow.input.xoauth_requestor_id,
            limit: workflow.input.limit || 50
          })
        },{
          failWorkflowOnFailure: false
        });

        if (!workflow.canContinue()) return;

        workflowResult = workflow.activityResult(workflowId);

        failures = failures + workflowResult.failures;
        failureDetails = failureDetails.concat(workflowResult.failureDetails);

        page++;
      } while (workflowResult &&
               workflowResult.failures < workflow.input.limit &&
               workflowResult.processed == workflow.input.limit);

      var activityId2 = "updateEnquiryAutomation_" + enquiryAutomation.id;
      var enquiryAutomationUpdate = {
        run_at: new Date()
      };

      workflow.lambdaActivity({
        id: activityId2,
        name: "vreasyRequest",
        input: {
          endpoint: 'EnquiryAutomations',
          action: 'put_enquiry_automations',
          xoauth_requestor_id: workflow.input.xoauth_requestor_id,
          params: {
            enquiry_automations_id: enquiryAutomation.id,
            enquiry_automations: enquiryAutomationUpdate,
            fields: 'id'
          }
        }
      },{
        failWorkflowOnFailure: false
      });

      if (workflow.hasActivityFinished(activityId2)) {
        results.processed++;
      }
    }

    workflow.completeWorkflow(results);
  }
};

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
};
