if (!process.env.APPLICATION_ENV) {
  console.log(color.red('environment variable APPLICATION_ENV is not set'));
  process.exit(1);
}
var domain = process.env.APPLICATION_ENV;
var pollerCredentials = {};
if (domain == 'development') {
  if (!process.env.WF_SUBDOMAIN) {
    console.log(color.red('environment variable WF_SUBDOMAIN is not set'));
    process.exit(1);
  }
  domain = domain + process.env.WF_SUBDOMAIN.charAt(0).toUpperCase() + process.env.WF_SUBDOMAIN.slice(1);
  // In development environments, setup the aws credentials to be used for the poller
  // The credentials are a copy of S3_ACCESS_KEY and S3_SECRET_KEY constants defined in application.php,
  // hardcoded here to avoid having to setup new environment variables
  pollerCredentials = {
    accessKeyId: 'AKIAJ57VEH5OKCJVMUTA',
    secretAccessKey: '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'
  };
}

module.exports = {
  domain: domain,
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    apiVersions: {
      swf: '2012-01-25',
      lambda: '2015-03-31'
    }
  },
  lambdaRole: "arn:aws:iam::836897382102:role/swf-lambda",
  lambdaExecRole: "arn:aws:iam::836897382102:role/lambda_exec_role",
  pollerCredentials: pollerCredentials
};
