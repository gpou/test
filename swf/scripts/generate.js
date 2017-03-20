var fs = require('fs')
    async = require('async')
    argv = require('minimist')(process.argv.slice(2))
    color = require('cli-color')
    Functions = require('./functions')


var typeToProcess = argv.type;
var lambdaToProcess = argv.lambda;

if (!argv.type) {
    console.log(color.red('type argument is required.'));
    console.log('usage: node generate.js --type activity --name myActivity');
    process.exit(1);
}
if (!argv.name) {
    console.log(color.red('name argument is required.'));
    console.log('usage: node generate.js --type activity --name myActivity');
    process.exit(1);
}

var path = __dirname + '/../' + argv.type + '/' + argv.name;

var series = [];

if (fs.existsSync(path)) {
    if (!argv.override) {
        console.log(color.red('lambda already exists. Please send --override'));
        process.exit(1);
    }
    series.push(function(callback) {
        Functions.deleteFolder(path, callback);
    });
}

series.push(function(callback) {
    Functions.generate(argv.type + 'Generator/', path, callback);
});

series.push(function(callback) {
    var packageFile = path + '/package.json';
    var packageInfo = require(packageFile);
    packageInfo.name = argv.name;
    fs.writeFileSync(packageFile, JSON.stringify(packageInfo, null, 2));
    callback();
});

async.series(series, function(err, results) {
    var errors = _.filter(results, function(result) {
        return (result !== undefined);
    })
    if (errors.length > 0) {
        console.log(color.red('GENERATE PROCESS FAILED'));
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
        console.log(color.green('successfully generated lambda ' + argv.type + '/' + argv.name));
    }
});
