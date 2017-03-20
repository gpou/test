module.exports = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    apiVersions: {
      swf: '2012-01-25'
    }
  },
  lambdaRole: "arn:aws:iam::836897382102:role/swf-lambda"
};
