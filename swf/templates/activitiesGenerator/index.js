var Activity = require('./lib/activity');

var activityFunction = exports.activityFunction = function(activity) {
  /**
   * Write your input validations here
   *
   * if (!activity.input.my_required_parameter) {
   *   utils.error("Invalid parameters", {my_required_parameter: 'required'});
   *   return;
   * }
   */

  /**
   * Write your activity code here
   *
   * utils.request(
   *   'Endpoint',
   *   'action',
   *   {
   *     some_parameter: utils.input.some_parameter
   *   },
   *   function(result) {
   *     utils.failure("Couldn't perform the request", result);
   *   }
   * );
   */
};

exports.handler = function (event, context) {
  var activity = new Activity(event, context);

  activity.run(activityFunction);
}
