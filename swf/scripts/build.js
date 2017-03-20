var fs = require('fs')
    async = require('async')
    argv = require('minimist')(process.argv.slice(2))
    color = require('cli-color')
    Functions = require('./functions')
    __ = {
      union: require('lodash-compat/array/union')
    }

var typeToProcess = argv.type;
var lambdaToProcess = argv.name;
var deleteOldVersions = false;

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
    Functions.templatesDependencies('activities', ' --production', callback);
});
series.push(function(callback) {
    Functions.templatesDependencies('deciders', ' --production', callback);
});

lambdas.forEach(function(lambda) {
    series.push(function(callback) {
        console.log('-------------------------------------------');
        console.log('building and uploading lambda ' + lambda.type + '/' + lambda.name);
        callback();
    });

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

    series.push(function(callback) {
        Functions.zip(lambda.type, lambda.name, callback);
    });

    series.push(function(callback) {
        Functions.upload(lambda.type, lambda.name, callback, argv);
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

    series.push(function(callback) {
        console.log(color.green('successfully built and uploaded lambda ' + lambda.type + '/' + lambda.name));
        callback();
    });
})

async.series(series, function(err, results) {
    Functions.cleanup();
    console.log('');
    console.log('');
    console.log('-------------------------------------------');
    var errors = _.filter(results, function(result) {
        return (result !== undefined);
    })
    if (errors.length > 0) {
        console.log(color.red('UPLOAD PROCESS FAILED'));
        errors.forEach(function (error, index) {
            console.log('-------------------------------------------');
            console.error(color.red((index + 1) + ' - ' + error.projectName + ': ' + error.message));
            if (error.output) {
                console.log(error.output);
            }
            console.log('');
        });
        process.exit(1);
    } else {
        console.log(color.green('Upload process finished successfully'));
    }
});
