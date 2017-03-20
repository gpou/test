var AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {
    var lambda = new AWS.Lambda({
      region: process.env.AWS_REGION || 'us-east-1',
      apiVersions: {
        swf: '2012-01-25'
      }
    });

    var params = {
      FunctionName: event.functionName,
      Payload: JSON.stringify(event.input),
      Qualifier: event.alias
    };
    console.log('--- Invoking lambda', params);
    lambda.invoke(params, function(err, data) {
      if (err) {
        console.log("--- error " + err, err.stack);
        callback(JSON.stringify({errorMessage: 'error while invoking the lambda function', details: err}));
      } else {
        console.log("--- lambda response:");
        console.log(data);
        if (data.FunctionError) {
          try {
            var response = JSON.parse(data.Payload);
            if (response.errorMessage) {
              callback(response.errorMessage);
            } else {
              callback(response);
            }
          } catch (ex) {
            return data.Payload;
          }
        } else {
          callback(null, data.Payload);
        }
      }
    });
}
