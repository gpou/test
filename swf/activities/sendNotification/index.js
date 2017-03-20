var Activity = require('./lib/activity');
var AWS = require('aws-sdk');
var Q = require('q');

AWS.config.update({
  region: 'us-east-1'
});

var snsClient = new AWS.SNS();

var activityFunction = exports.activityFunction = function(activity) {
  if (!activity.input.vreasyEvent) {
    activity.error("Invalid parameters", {vreasyEvent: 'required'});
    return;
  }

  var snsTopic = activity.input.snsTopic;
  var snsSubject = activity.input.vreasyEvent.event;
  var snsMessage = activity.input.vreasyEvent;

  activity.publishToSns(
    snsTopic,
    snsSubject,
    snsMessage,
    function (data) {
      activity.request(
        'Listings',
        'put_listing',
        {
          listing: {
            rates_updated_at: new Date(),
          },
          listing_id: snsMessage.resource_id,
          xoauth_requestor_id: activity.input.vreasyEvent.pm_user_id
        },
        function(result) {
          activity.success("ok");
        },
        function (err) {
          activity.failure(err);
        }
      );
    },
    function (err) {
      activity.failure(err);
    }
  );
};

exports.handler = function (event , context) {
  var activity = new Activity(event, context);

  activity.publishToSns = function (snsTopic, snsSubject, snsMessage, successCallback, errorCallBack) {

    var params = {
       TopicArn: snsTopic,
       Subject: snsSubject,
       Message: JSON.stringify(snsMessage)
    }

    var d = Q.defer();
    snsClient.publish(
      params,
      function (err, data) {
        if (!err) {
          d.resolve(data);
        } else {
          d.reject(err);
        }
      }
    );

    d.promise.then(function(data) {
      successCallback(data);
    })
    .catch(function(err){
      errorCallback(errorCallback);
    });

  };

  activity.run(activityFunction);
}
