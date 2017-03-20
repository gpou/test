var fs = require('fs')
    async = require('async')
    argv = require('minimist')(process.argv.slice(2))
    color = require('cli-color')
    Functions = require('./functions')
    __ = {
      union: require('lodash-compat/array/union'),
      filter: require('lodash-compat/collection/filter')
    }

var typeToProcess = argv.type;
var lambdaToProcess = argv.name;
var skipVersionsCheck = argv.skipVersionsCheck || false;
var skipCodeChangesCheck = argv.skipCodeChangesCheck || false;
var skipOauthCredentialsCheck = argv.skipOauthCredentialsCheck || false;
var continueOnFailure = argv.continueOnFailure || false;

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
    var lambdas = __.union(
        Functions.readProjects('activities'),
        Functions.readProjects('deciders')
    );
}

var series = [];

series.push(function(callback) {
  Functions.checkNodeAndNpmVersions(callback);
});

series.push(function(callback) {
    Functions.prepare(argv, callback);
});

series.push(function(callback) {
    Functions.templatesDependencies('activities', '', callback);
});
series.push(function(callback) {
    Functions.templatesDependencies('deciders', '', callback);
});

if (!skipCodeChangesCheck) {
    series.push(function(callback) {
        Functions.fetchCodeChangesFromPR(callback);
    });
}

lambdas.forEach(function(lambda) {
    series.push(function(callback) {
        console.log('-------------------------------------------');
        console.log('Testing ' + lambda.type + '/' + lambda.name);
        callback();
    });

    if (lambda.type == 'deciders') {
        // validate the workflow variables defined in package.json
        series.push(function(callback) {
            Functions.validatePackageInfo(lambda.type, lambda.name, callback);
        });
    }

    // get a copy of the template for the type of project on a temporal folder
    series.push(function(callback) {
        Functions.generate(lambda.type, Functions.tmpFolder + '/' + lambda.type + '/' + lambda.name, callback);
    });

    // copy the real code into the temporal folder
    series.push(function(callback) {
        Functions.copyCode(lambda.type + '/' + lambda.name, callback);
    });

    if (lambda.type == 'activities') {
        series.push(function(callback) {
            Functions.addEnvironmentVariables(lambda.type + '/' + lambda.name, ['VREASY_OAUTH_KEY', 'VREASY_OAUTH_SECRET'], callback);
        });
    }

    // install dependencies
    series.push(function(callback) {
        Functions.dependencies(lambda.type + '/' + lambda.name, '', callback);
    });

    // test the project
    series.push(function(callback) {
        Functions.test(lambda.type + '/' + lambda.name, callback, argv);
    });

    // check that the lambda function and alias exists, that the sha is correct and the local function files have not changed
    if (!skipVersionsCheck) {
        series.push(function(callback) {
            Functions.checkLambda(lambda.type, lambda.name, callback, argv);
        });
    }
})

// check that the oauth key and secret defined as environment variables and injected into the activities are valid
if (!skipOauthCredentialsCheck) {
    series.push(function(callback) {
        Functions.checkOauthCredentials(callback, argv);
    });
}

async.series(series, function(err, results) {
    //Functions.cleanup();
    console.log('');
    console.log('');
    console.log('-------------------------------------------');
    var errors = __.filter(results, function(result) {
        return (result !== undefined);
    })
    if (errors.length > 0) {
        console.log(color.red('TEST PROCESS FAILED'));
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
        console.log(color.green('Test process finished successfully'));
    }
});
