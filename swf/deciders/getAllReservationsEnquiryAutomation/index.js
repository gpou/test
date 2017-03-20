var Workflow = require('./lib/workflow');

var deciderFunction = exports.deciderFunction = function(workflow) {
  var results = {
    failures: 0,
    failureDetails: [],
    processed: 0,
  };

  var activityId = 'getReservationsEnquiryAutomation';

  workflow.lambdaActivity({
    id: activityId,
    name: "vreasyRequest",
    input: {
      endpoint: 'EnquiryAutomations',
      action: 'get_reservations_enquiry_automations',
      xoauth_requestor_id: workflow.input.enquiry_user_id,
      params: {
        enquiry_automations_id: workflow.input.enquiry_automations_id,
        limit: workflow.input.limit || 25,
        fields: 'id'
      }
    }
  });

  if (workflow.hasActivityFinished(activityId)) {
    var reservationIds = workflow.activityResult("getReservationsEnquiryAutomation");

    if (reservationIds !== undefined && !(reservationIds instanceof Array)) {
      reservationIds = [reservationIds];
    }

    for (var i in reservationIds) {
      var reservation = reservationIds[i];
      var activityId2 = "updateReservation_" + reservation.id;
      var reservationUpdate = {
        status: "CANCELLED"
      };

      workflow.lambdaActivity({
        id: activityId2,
        name: "vreasyRequest",
        input: {
          endpoint: 'Reservations',
          action: 'put_reservation',
          xoauth_requestor_id: workflow.input.enquiry_user_id,
          params: {
            fields: 'id,status',
            reservation_id: reservation.id,
            reservation: reservationUpdate
          }
        }
      },{
        failWorkflowOnFailure: false
      });

      var activityStatus = workflow.activityStatus(activityId2);

      if (activityStatus == "failed"){
        results.failures++;
        results.failureDetails.push({user_id: workflow.input.enquiry_user_id, result: workflow.activityResult(activityId2)});
      } else if (activityStatus == "timedout"){
          results.failures++;
          results.failureDetails.push({user_id: workflow.input.enquiry_user_id, result: "timed out"});
      }

      results.processed++;
    }

    workflow.completeWorkflow(results);
  }
};

exports.handler = function (event, context) {
  var workflow = new Workflow(event, context);

  workflow.run(deciderFunction);
};
