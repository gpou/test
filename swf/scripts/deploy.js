var fs = require('fs')
    async = require('async')
    argv = require('minimist')(process.argv.slice(2))
    color = require('cli-color')
    Functions = require('./functions')
    _ = {
      union: require('lodash-compat/array/union'),
      filter: require('lodash-compat/collection/filter'),
      flatten: require('lodash-compat/array/flatten'),
    }

var typeToProcess = argv.type;
var lambdaToProcess = argv.name;
var deleteOldVersions = argv.deleteOldVersions || false;
var registerCrons = argv.registerCrons || false;

var lambdas = [];
if (typeToProcess) {
    if (lambdaToProcess) {
        if (!fs.existsSync(__dirname + '/../' + argv.type + '/' + argv.name)) {
            console.log(color.red('lambda does not exist in ' + __dirname + '/../' + argv.type + '/' + argv.name));
            process.exit(1);
        }
        var lambdas = [{type: typeToProcess, name: lambdaToProcess}];
    } else {
        var lambdas = Functions.readProjects(typeToProcess);
    }
} else {
    var lambdas = _.union(
        Functions.readProjects('activities'),
        Functions.readProjects('deciders')
    );
}

var series = [];

series.push(function(callback) {
    Functions.prepare(argv, callback);
});

lambdas.forEach(function(lambda) {
    series.push(function(callback) {
        console.log('-------------------------------------------');
        console.log('deploying lambda ' + lambda.type + '/' + lambda.name);
        callback();
    });

    series.push(function(callback) {
        Functions.deploy(lambda.type, lambda.name, callback);
    });

    if (deleteOldVersions) {
        series.push(function(callback) {
            Functions.cleanupLambda(lambda.type, lambda.name, callback);
        });
    }

    if (lambda.type == 'deciders') {
        series.push(function(callback) {
            Functions.registerWorkflow(lambda.type, lambda.name, callback);
        });
    }
})

if (registerCrons) {
    lambdas.forEach(function(lambda) {
        if (lambda.type == 'deciders') {
            var packageFile = __dirname + '/../' + lambda.type + '/' + lambda.name + '/package.json';
            var packageInfo = require(packageFile);
            var cronAttributes = packageInfo.cronAttributes || {};
            var schedule = cronAttributes.schedule;
            var retries = cronAttributes.retries || 5;
            if (cronAttributes.schedule) {
                series.push(function(callback) {
                    var lambdaName = Functions.getLambdaName('activities', 'startWorkflow');
                    var input = {
                        workflow_name: lambda.name,
                        xoauth_requestor_id: 1,
                        input: {
                            xoauth_requestor_id: 1,
                            options: {
                                workflowRetries: retries
                            }
                        }
                    };
                    Functions.registerCron(lambdaName, lambda.name, schedule, input, callback);
                });
            }
        }
    });
}

async.series(series, function(err, results) {
    //Functions.cleanup();
    console.log('');
    console.log('');
    console.log('-------------------------------------------');
    var errors = _.filter(_.flatten(results), function(result) {
        return (result !== undefined);
    })
    if (errors.length > 0) {
        console.log(color.red('DEPLOY PROCESS FAILED'));
        errors.forEach(function (error, index) {
            console.log('-------------------------------------------');
            console.error(color.red((index + 1) + ' - ' + error.projectName + ': ' + error.message));
            if (error.output) {
                console.log(error.output);
            }
            console.log('');
        });
        console.log('');
        console.log('If you are just testing the functions in local before deploying and see errors of type "The lambda function for ... does not exist in Amazon" or "The lambda version for ... does not exist in Amazon", add a --skipVersionsCheck parameter');
        process.exit(1);
    } else {
        console.log(color.green('Deploy process finished successfully'));
    }
});
