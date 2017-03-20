var fs = require('fs')
    path = require('path')
    exec = require('child_process').exec
    color = require('cli-color')
    _ = {
      filter: require('lodash-compat/collection/filter'),
      map: require('lodash-compat/collection/map'),
      some: require('lodash-compat/collection/some'),
      uniq: require('lodash-compat/array/uniq'),
      max: require('lodash-compat/math/max'),
      keys: require('lodash-compat/object/keys'),
      startsWith: require('lodash-compat/string/startsWith')
    }
    AWS = require('aws-sdk')
    config = require('./config.js')
    http = require('http')
    https = require('https')
    OAuth = require('oauth').OAuth
    crypto = require('crypto')
    async = require('async')
    GitHubApi = require("github");

AWS.config = new AWS.Config(config.aws);
AWS.config.update({
    retryDelayOptions: {base: 1000},
    httpOptions: {timeout: 600000}
});

var lambda = new AWS.Lambda();
// PATCH to allow retries on TooManyRequestsException
// original throttledError function located at node_modules/aws-sdk/lib/service.js
var originalLambdaThrottledError = lambda.throttledError;
lambda.throttledError = function(error) {
  return originalLambdaThrottledError(error) || error.code == 'TooManyRequestsException';
}

var tmpFolder = module.exports.tmpFolder = __dirname + '/tmp';
var templatesFolder = 'templates';

var defaultLambdaMemorySize = { activities: "128", deciders: "128" };
var defaultLambdaTimeout = { activities: "90", deciders: "60" };
var defaultSwfExecutionStartToCloseTimeout = "1500";
var defaultSwfTaskStartToCloseTimeout = "1200";
var defaultSwfWorkflowExecutionRetentionPeriodInDays = "15";
var defaultWorkflowCleanupTimeBeforeTimeout = "20";
var options = {};
var lambdasToCheckForChanges = [];

var checkNodeAndNpmVersions = module.exports.checkNodeAndNpmVersions = function(callback) {
    console.log('Verifying Node and Npm versions');
    if (process.version != 'v4.3.2') {
        handleError('Node version must be 4.3.2 and is ' + process.version, '', 'versions', callback);
    } else {
      exec('npm -v',
        function (error, stdout, stderr) {
          var lines = stdout.toString().split('\n');
          if (lines[0] != "3.10.7") {
            handleError('Npm version must be 3.10.7 and is ' + stdout, '', 'versions', callback);
          } else {
            callback();
          }
      })
    }
}

var prepare = module.exports.prepare = function(opts, callback) {
    options = opts || {};
    cleanup(function(fake, err) {
        if (err) {
            callback(null, err);
            return;
        }
        if (!fs.existsSync(tmpFolder)) {
            fs.mkdirSync(tmpFolder);
        }
        if (!fs.existsSync(tmpFolder + '/activities')) {
            fs.mkdirSync(tmpFolder + '/activities');
        }
        if (!fs.existsSync(tmpFolder + '/deciders')) {
            fs.mkdirSync(tmpFolder + '/deciders');
        }
        callback();
    });
}

var cleanup = module.exports.cleanup = function(callback) {
    deleteFolder(tmpFolder, callback);
}

var readProjects = module.exports.readProjects = function(type) {
    var projects = [];
    var basePath = __dirname + '/../' + type;
    var files = fs.readdirSync(basePath);
    files.forEach(function (file) {
        var curSource = path.join(basePath, file);
        if ((file[0] != '.') && fs.lstatSync( curSource ).isDirectory()) {
            projects.push({type: type, name: file});
        }
    })
    return projects;
}

var generate = module.exports.generate = function(type, projectFolder, callback) {
    console.log('   making a copy of the template ' + templatesFolder + '/' + type);
    copyFolder(__dirname + '/../' + templatesFolder + '/' + type, projectFolder, function(data, err) {
      copyFolder(__dirname + '/../' + templatesFolder + '/common/*', projectFolder, function(data, err) {
        callback(data, err);
      });
    });
}

var copyCode = module.exports.copyCode = function(projectFolder, callback) {
    console.log('   copying function code');
    copyFolder(__dirname + '/../' + projectFolder + '/*', tmpFolder + '/' + projectFolder, callback);
}

var addEnvironmentVariables = module.exports.addEnvironmentVariables = function(projectFolder, vars, callback) {
    console.log('   adding environment variables');
    var envFile = tmpFolder + '/' + projectFolder + '/.env';
    try {
        var env = fs.readFileSync(envFile);
    } catch (err) {
        var env = '';
    }
    for (var k in vars) {
        var key = vars[k];
        if (process.env[key] == undefined) {
            handleError('The environment variable ' + key + ' is undefined', '', projectFolder, callback);
            return;
        }
        env += "\n" + key + '=' + process.env[key];
    }
    fs.writeFileSync(envFile, env);
    callback();
}

var checkOauthCredentials = module.exports.checkOauthCredentials = function(callback) {
    console.log('Verifying Oauth credentials');
    if (process.env['VREASY_OAUTH_KEY'] == undefined) {
        handleError('The environment variable VREASY_OAUTH_KEY is undefined', '', 'oauthCredentials', callback);
        return;
    }
    if (process.env['VREASY_OAUTH_SECRET'] == undefined) {
        handleError('The environment variable VREASY_OAUTH_SECRET is undefined', '', 'oauthCredentials', callback);
        return;
    }
    var url = '/api/account?xoauth_requestor_id=1';
    var httpLib = http;
    switch(config.domain) {
      case 'production': url = "https://www.vreasy.com" + url; httpLib = https; break;
      case 'staging': url = "https://stage.vreasy.com" + url; httpLib = https; break;
      case 'circle': url = "http://test.vreasy.com" + url; break;
      default: url = "http://www.vreasy.dev" + url;
    }
    var oa = new OAuth(null, null, process.env['VREASY_OAUTH_KEY'], process.env['VREASY_OAUTH_SECRET'], "1.0", null, "HMAC-SHA1");
    var url = oa.signUrl(url);
    httpLib.get(url, function(res) {
        if (res.statusCode != 200) {
            handleError('Request to ' + url + ' failed with status code ' + res.statusCode + '. Please check the oauth credentials defined as environment variables VREASY_OAUTH_KEY and VREASY_OAUTH_SECRET', '', 'oauthCredentials', callback);
            return;
        }
        callback();
    }).on('error', function(e) {
        handleError('Error while making a request to /api/account to check the oauth credentials: ' + e.message, e, 'oauthCredentials', callback);
        return;
    });

}

var dependencies = module.exports.dependencies = function(projectFolder, args, callback) {
    console.log('   installing dependencies');
    var projectTmpFolder = tmpFolder + '/' + projectFolder;

    var child = exec('npm install --cache-min=Infinity --loglevel=error' + args, {cwd: projectTmpFolder, env: process.env});
    var output = '';
    child.stdout.on('data', function(data) {
        output = output + data;
    });
    child.stderr.on('data', function(data) {
        output = output + data;
    });

    child.on('close', function(code) {
        if (code === 0) {
            callback();
        } else {
            handleError('install dependencies failed', output, projectFolder, callback);
            return;
        }
    });
}

var templatesDependencies = module.exports.templatesDependencies = function(type, args, callback) {
    console.log('Installing templates dependencies for ' + type);

    var child = exec('npm install --cache-min=Infinity --loglevel=error' + args, {cwd: __dirname + '/../templates/' + type, env: process.env});
    var output = '';
    child.stdout.on('data', function(data) {
        output = output + data;
    });
    child.stderr.on('data', function(data) {
        output = output + data;
    });

    child.on('close', function(code) {
        if (code === 0) {
          callback()
        } else {
          handleError('install dependencies failed', output, type, callback);
          return;
        }
    });
}

var zip = module.exports.zip = function(projectType, projectName, callback) {
    var projectFolder = projectType + '/' + projectName;

    console.log('   building zip file');

    var folder = tmpFolder + '/' + projectFolder;
    var sedArgs = /^darwin/.test(process.platform) ? '-i \'\' -e' : '-i -e';
    var child = exec('cd ' + folder +
        ' && rm -rf node_modules/*' +
        ' && npm install --cache-min=Infinity --production --loglevel=error' +
        ' && npm prune --production' +
        ' && npm dedupe' +
        // many dependencies rely on lodash, but swagger-client needs lodash-compat (which is not maintained)
        // so try to minimize the size of the zip by removing unneeded files until we find a way to
        // avoid this duplication (ie. switch to another library for swagger)
        ' && rm -rf node_modules/lodash-compat/index.js' +
        ' && rm -rf node_modules/lodash/lodash.js' +
        ' && rm -rf node_modules/lodash/lodash.min.js' +
        ' && rm -rf node_modules/lodash/core.js' +
        ' && rm -rf node_modules/lodash/core.min.js' +
        // swagger-client also includes a big folder 'browser' which we don't use
        ' && rm -rf node_modules/swagger-client/browser' +
        // async contains a big dist folder, not needed (maybe we could try to remove ANY dist folder)
        ' && rm -rf node_modules/async/dist' +
        // remove all files starting with .
        ' && find . -name \'.[^.|env]*\' -exec rm -rf {} \\+' +
        // remove all .bin folders to minimize the size of the zip
        ' && find . -name \'.bin\' -exec rm -rf {} \\+' +
        // remove local paths from packages.json files in node_modules to prevent the zips to differ
        // depending on the maching where it is executed
        // (sed arguments differ between Osx and Linux)
        ' && find . -name \'package.json\' -path \'./node_modules*\' -type f -exec sed ' +
        (/^darwin/.test(process.platform) ? '-i \'\' -e' : '-i -e') +
        ' \'s\/' + folder.replace(/\//g, "\\\/") + '\/\/g\' {} \\+');
    var output = '';
    child.stdout.on('data', function(data) {
        //output += data;
    });
    child.stderr.on('data', function(data) {
        output += data;
    });

    child.on('close', function(code) {
        if (code !== 0) {
            handleError('zip creation failed', output, projectType + '/' + projectName, callback);
            return;
        }

        var packagesChild = exec('find ' + tmpFolder + '/' + projectFolder + '/node_modules -name package.json')
        var packagesOutput = '';
        var packagesError = '';
        packagesChild.stdout.on('data', function(data) {
            packagesOutput += data;
        });
        packagesChild.stderr.on('data', function(data) {
            packagesError += data;
        });

        // Some packages contain the "man" key with values pointing to folders on the local filesystem,
        // and that prevents the final zip checksum to be the same across computers
        // Remove all the "man" entries on the package.json files in dependencies
        packagesChild.on('close', function(code) {
            if (code !== 0) {
                // If error, it means that the node_modules doesn't exist, so do not throw any error
            }

            packagesOutput.split("\n").forEach(function(packageFile) {
                if (!packageFile) return;
                var packageInfo = require(packageFile);
                if (packageInfo.man) {
                    delete(packageInfo.man);
                    fs.writeFileSync(packageFile, JSON.stringify(packageInfo, null, 2));
                }
            });

            var zipChild = exec('cd ' + tmpFolder + '/' + projectFolder +
                ' && for i in `find . ! -wholename \'./package.json\' -name \'[^_]*\' -type f -exec echo {} \\;  | sort -df`; do if [ -f "$i" ] ; then chmod -R 777 $i; touch -t 201601010000 $i; zip ../' + projectName + '.zip $i -rXy; fi; done' +
                ' && for i in `find . ! -wholename \'./package.json\' -name \'_*\' -type f -exec echo {} \\;  | sort -df`; do if [ -f "$i" ] ; then chmod -R 777 $i; touch -t 201601010000 $i; zip ../' + projectName + '.zip $i -rXy; fi; done' +
                ' && chmod -R 777 ./package.json; touch -t 201601010000 ./package.json; zip ../' + projectName + '.zip ./package.json -rXy');
            var zipOutput = '';
            zipChild.stdout.on('data', function(data) {
                //zipOutput += data;
            });
            zipChild.stderr.on('data', function(data) {
                zipOutput += data;
            });

            zipChild.on('close', function(code) {
                if (code !== 0) {
                    handleError('zip creation failed', zipOutput, projectType + '/' + projectName, callback);
                    return;
                }
                addPackageToZip(projectType, projectName, callback);
            });
        });
    });
}

var addPackageToZip = module.exports.addPackageToZip = function(projectType, projectName, callback) {
    var projectFolder = projectType + '/' + projectName;
    var child = exec('cd ' + tmpFolder + '/' + projectFolder +
        ' && chmod -R 777 ./package.json; touch -t 201601010000 ./package.json; zip ../' + projectName + '.zip ./package.json -rXy -Z store');
    var output = '';
    child.stdout.on('data', function(data) {
        //output += data;
    });
    child.stderr.on('data', function(data) {
        output += data;
    });

    child.on('close', function(code) {
        if (code !== 0) {
            handleError('zip creation failed', output, projectType + '/' + projectName, callback);
            return;
        }
        callback();
    });
}

var getLambdaFunction = module.exports.getLambdaFunction = function(functionName, callback) {
    lambda.getFunction({FunctionName: functionName}, function(err, data) {
        if (err) {
            if (err.code == 'ResourceNotFoundException') {
                // If the function does not exist in lambda, just return an empty object
                callback();
            } else {
                handleError('getLambdaFunction failed', err, functionName, callback);
                return;
            }
        } else {
            var results = {
                description: data.Configuration.Description,
                timeout: data.Configuration.Timeout,
                memorySize: data.Configuration.MemorySize
            };
            callback(results);
        }
    });
}

var getLambdaVersions = module.exports.getLambdaVersions = function(functionName, callback) {
    var limit = 100;
    var page = 0;
    var marker = '';
    var response = {};
    async.whilst(
        function () { return (page == 0 || marker != null) },
        function (pageCallback) {
            lambda.listVersionsByFunction({
                FunctionName: functionName,
                Marker: page > 0 ? marker : null,
                MaxItems: limit
            }, function(err, data) {
                if (err) {
                    handleError('getLambdaVersions failed', err, functionName, pageCallback);
                    return;
                }
                page++;
                marker = data.NextMarker
                data.Versions.forEach( function(version) {
                    if (version.Version != '$LATEST') {
                        response[version.Version] = { sha256: version.CodeSha256, LastModified: version.LastModified };
                    }
                })
                pageCallback();
            });
        },
        function (results, err) {
            callback(response);
        }
    );
}

var getLambdaAliases = module.exports.getLambdaAliases = function(functionName, callback) {
    var limit = 100;
    var page = 0;
    var marker = '';
    var response = {};
    async.whilst(
        function () { return (page == 0 || marker != null) },
        function (pageCallback) {
            lambda.listAliases({
                FunctionName: functionName,
                Marker: page > 0 ? marker : null,
                MaxItems: limit
            }, function(err, data) {
                if (err) {
                    handleError('getLambdaAliases failed', err, functionName, pageCallback);
                    return;
                }
                page++;
                marker = data.NextMarker
                data.Aliases.forEach( function(alias) {
                    response[alias.Name] = alias.FunctionVersion;
                })
                pageCallback();
            });
        },
        function (results, err) {
            callback(response);
        }
    );
}

var getFullLambdaInfo = module.exports.getFullLambdaInfo = function(functionName, callback) {
    getLambdaFunction(functionName, function(functionData) {
        // If no data is returned, it means that the function does not still exist
        if (!functionData) {
            callback();
        } else {
            var results = {
                config: functionData,
                versions: [],
                aliases: {}
            };
            getLambdaVersions(functionName, function(versionsData) {
                results.versions = versionsData;
                getLambdaAliases(functionName, function(aliasesData) {
                    results.aliases = aliasesData;
                    callback(results);
                });
            });
        }
    });
}

var calculateLambdaSha256 = module.exports.calculateLambdaSha256 = function(zipFile, callback) {
    var shasum = crypto.createHash('sha256');
    fs.createReadStream(zipFile)
        .on("data", function (chunk) {
            shasum.update(chunk);
        })
        .on("end", function () {
            callback(shasum.digest('base64'));
        });
}

var createLambdaFunction = module.exports.createLambdaFunction = function(projectType, lambdaName, projectFile, opts, callback) {
    var params = {
        Code: {
            ZipFile: fs.readFileSync(projectFile)
        },
        FunctionName: lambdaName,
        Handler: 'index.handler',
        Role: config.lambdaExecRole,
        Runtime: 'nodejs4.3',
        Description: opts.description || '',
        MemorySize: opts.memorySize || defaultLambdaMemorySize[projectType],
        Timeout: opts.timeout || defaultLambdaTimeout[projectType],
        Publish: true
    };

    lambda.createFunction(params, function(err, data) {
        if (err) {
            handleError('createLambdaFunction failed', err, lambdaName, callback);
        } else {
            console.log('   created the function and version is ' + data.Version);
            callback(data);
        }
    });
}

var updateLambdaFunctionAndConfiguration = module.exports.updateLambdaFunctionAndConfiguration = function(projectType, lambdaName, projectFile, currentOpts, opts, callback) {
    if (currentOpts.description != opts.description ||
        currentOpts.timeout != opts.timeout ||
        currentOpts.memorySize != opts.memorySize) {
        updateLambdaFunctionConfiguration(projectType, lambdaName, opts, function(data) {
            updateLambdaFunctionCode(lambdaName, projectFile, callback);
        });
    } else {
        updateLambdaFunctionCode(lambdaName, projectFile, callback);
    }
}

var updateLambdaFunctionCode = module.exports.updateLambdaFunctionCode = function(lambdaName, projectFile, callback) {
    var params = {
        ZipFile: fs.readFileSync(projectFile),
        FunctionName: lambdaName,
        Publish: true
    };
    lambda.updateFunctionCode(params, function(err, data) {
        if (err) {
            handleError('updateLambdaFunctionCode failed', err, lambdaName, callback);
        } else {
            console.log('   updated the function and new version is ' + data.Version);
            callback(data);
        }
    });
}

var updateLambdaFunctionConfiguration = module.exports.updateLambdaFunctionConfiguration = function(projectType, lambdaName, opts, callback) {
    var confParams = {
        FunctionName: lambdaName,
        Description: opts.description || '',
        MemorySize: opts.memorySize || defaultLambdaMemorySize[projectType],
        Timeout: opts.timeout || defaultLambdaTimeout[projectType]
    };
    lambda.updateFunctionConfiguration(confParams, function(err, data) {
        if (err) {
            handleError('updateLambdaFunctionConfiguration failed', err, lambdaName, callback);
        } else {
            console.log('   updated the function configuration');
            callback(data);
        }
    });
}

var createLambdaAlias = module.exports.createLambdaAlias = function(lambdaName, version, callback) {
    var params = {
      FunctionName: lambdaName,
      FunctionVersion: version,
      Name: config.domain
    };
    lambda.createAlias(params, function(err, data) {
        if (err) {
            handleError('createLambdaAlias failed', err, lambdaName, callback);
        } else {
            console.log('   created the alias ' + config.domain + ' pointing to version ' + version);
            callback(data);
        }
    });
}

var updateLambdaAlias = module.exports.updateLambdaAlias = function(lambdaName, version, callback) {
    var params = {
      FunctionName: lambdaName,
      FunctionVersion: version,
      Name: config.domain
    };
    lambda.updateAlias(params, function(err, data) {
        if (err) {
            handleError('updateLambdaAlias failed', err, lambdaName, callback);
        } else {
            console.log('   updated the alias ' + config.domain + ' to point to version ' + version);
            callback(data);
        }
    });
}

var deleteLambdaVersion = module.exports.deleteLambdaVersion = function(lambdaName, version, callback) {
    var params = {
      FunctionName: lambdaName,
      Qualifier: version
    };
    lambda.deleteFunction(params, function(err, data) {
        if (err) {
            handleError('deleteLambdaVersion failed for version '+version, err, lambdaName, callback);
        } else {
            callback();
        }
    });
}

var getLambdaName = module.exports.getLambdaName = function(projectType, projectName) {
    var lambdaPrefix = (projectType == 'activities') ? 'activity' : 'decider';
    return lambdaPrefix + projectName.charAt(0).toUpperCase() + projectName.slice(1);
}

var upload = module.exports.upload = function(projectType, projectName, callback) {
    var lambdaName = getLambdaName(projectType, projectName);
    var packageFile = __dirname + '/../' + projectType + '/' + projectName + '/package.json';
    var packageInfo = require(packageFile);
    var projectFolder = projectType + '/' + projectName;
    var projectTmpFolder = tmpFolder + '/' + projectFolder;
    var projectFile = tmpFolder + '/' + projectFolder + '.zip';

    getFullLambdaInfo(lambdaName, function(lambdaInfo) {
        var lambdaConfig = {
            description: packageInfo.description,
            timeout: packageInfo.lambdaAttributes.timeout,
            memorySize: packageInfo.lambdaAttributes.memorySize
        }
        if (!lambdaInfo) {
            // gerFullLambdaInfo will return nothing if the function does not exist in aws
            console.log('   function does not exist in lambda. Uploading the code');
            createLambdaFunction(projectType, lambdaName, projectFile, lambdaConfig, function(data) {
                if (packageInfo.lambdaAttributes.version != data.Version) {
                    handleError("uploaded version does not match the one in package.json", '', projectType + '/' + projectName, callback);
                    return;
                }
                console.log('   creating the alias');
                createLambdaAlias(lambdaName, packageInfo.lambdaAttributes.version, function(data) {
                    callback();
                });
            });
        } else {
            if (!lambdaInfo.versions[packageInfo.lambdaAttributes.version]) {
                // If this version does not exist, upload it
                console.log('   function exists in lambda but version is new');
                getNextLambdaVersion(projectType, projectName, function(version) {
                    console.log('   updating the version in package.json to: ' + version);
                    packageInfo.lambdaAttributes.version = version.toString();
                    var tmpPackageFile = tmpFolder + '/' + projectType + '/' + projectName + '/package.json';
                    fs.writeFileSync(packageFile, JSON.stringify(packageInfo, null, 2));
                    fs.writeFileSync(tmpPackageFile, JSON.stringify(packageInfo, null, 2));

                    addPackageToZip(projectType, projectName, function(fake, err) {
                        if (err) {
                            callback(null, err);
                            return;
                        }
                        console.log('   uploading the new version to lambda');
                        updateLambdaFunctionAndConfiguration(projectType, lambdaName, projectFile, lambdaInfo.config, lambdaConfig, function(data) {
                            if (packageInfo.lambdaAttributes.version != data.Version) {
                                handleError("uploaded version does not match the one in package.json. Please run again the build script.", '', projectType + '/' + projectName, callback);
                                return;
                            }
                            if (lambdaInfo.aliases[config.domain]) {
                                console.log('   updating the alias');
                                updateLambdaAlias(lambdaName, packageInfo.lambdaAttributes.version, function(data) {
                                    callback();
                                });
                            } else {
                                console.log('   creating the alias');
                                createLambdaAlias(lambdaName, packageInfo.lambdaAttributes.version, function(data) {
                                    callback();
                                });
                            }
                        });
                    });
                });
            } else {
                // If this version already exists in lambda, check the sha256 to see if we must create a new version
                console.log('   function and version exist in lambda. Comparing checksum');
                calculateLambdaSha256(projectFile, function(sha256) {
                    if (lambdaInfo.versions[packageInfo.lambdaAttributes.version].sha256 == sha256) {
                        console.log('   checksum coincidence. nothing to upload');
                        // If sha is the same, nothing to do
                        callback();
                        return;
                    }
                    console.log('   checksum differs. Calculating next available version in lambda');
                    getNextLambdaVersion(projectType, projectName, function(version) {
                        console.log('   updating the version in package.json to: ' + version);
                        packageInfo.lambdaAttributes.version = version.toString();
                        var tmpPackageFile = tmpFolder + '/' + projectType + '/' + projectName + '/package.json';
                        fs.writeFileSync(packageFile, JSON.stringify(packageInfo, null, 2));
                        fs.writeFileSync(tmpPackageFile, JSON.stringify(packageInfo, null, 2));

                        addPackageToZip(projectType, projectName, function(fake, err) {
                            if (err) {
                                callback(null, err);
                                return;
                            }
                            calculateLambdaSha256(projectFile, function(sha256) {
                                console.log('   uploading the new version to lambda');
                                updateLambdaFunctionAndConfiguration(projectType, lambdaName, projectFile, lambdaInfo.config, lambdaConfig, function(data) {
                                    if (packageInfo.lambdaAttributes.version != data.Version) {
                                        handleError("uploaded version does not match the one in package.json Please run again the build script.", '', projectType + '/' + projectName, callback);
                                        return;
                                    }
                                    if (lambdaInfo.aliases[config.domain]) {
                                        console.log('   updating the alias');
                                        updateLambdaAlias(lambdaName, packageInfo.lambdaAttributes.version, function(data) {
                                            callback();
                                        });
                                    } else {
                                        console.log('   creating the alias');
                                        createLambdaAlias(lambdaName, packageInfo.lambdaAttributes.version, function(data) {
                                            callback();
                                        });
                                    }
                                });
                            });
                        });
                    });
                })
            }
        }
    });
}

var getNextLambdaVersion = module.exports.getNextLambdaVersion = function(projectType, projectName, callback) {
    var lambdaName = getLambdaName(projectType, projectName);

    getFullLambdaInfo(lambdaName, function(lambdaInfo) {
        if (!lambdaInfo) {
            var maxVersion = 0;
        } else {
            var maxVersion = _.max(_.keys(lambdaInfo.versions), function(version) {
                return parseInt(version);
            });
        }
        callback(parseInt(maxVersion) + 1);
    });
}

var checkLambda = module.exports.checkLambda = function(projectType, projectName, callback, argv) {
    var lambdaName = getLambdaName(projectType, projectName);
    var packageFile = __dirname + '/../' + projectType + '/' + projectName + '/package.json';
    var packageInfo = require(packageFile);
    var projectFile = tmpFolder + '/' + projectType + '/' + projectName + '.zip';
    var version = packageInfo.lambdaAttributes.version;
    argv = argv || {};
    console.log('   checking lambda functions and versions');

    getFullLambdaInfo(lambdaName, function(lambdaInfo) {
        if (!lambdaInfo) {
            handleError('The lambda function does not exist in Amazon', '', projectType + '/' + projectName, callback);
            return;
        }
        if (!lambdaInfo.versions[version]) {
            handleError('The lambda version defined in package.json is ' + version + ', and it does not exist in Amazon', '', projectType + '/' + projectName, callback);
            return;
        } else {
            if (argv.skipCodeChangesCheck || !hasLambdaCodeChanged(projectType, projectName)) {
                callback();
                return;
            }

            zip(projectType, projectName, function(fake, err) {
                if (err) {
                    callback(null, err);
                    return;
                }
                calculateLambdaSha256(projectFile, function(sha256) {
                    if (lambdaInfo.versions[packageInfo.lambdaAttributes.version].sha256 != sha256) {
                        handleError("checksum mismatch.", '', projectType + '/' + projectName, callback);
                        return;
                    }
                    console.log('   checksum coincidence');
                    callback();
                });
            });
        }
    });
}

var hasLambdaCodeChanged = module.exports.hasLambdaCodeChanged = function(projectType, projectName) {
    return _.some(lambdasToCheckForChanges, {type:'*'})
        || _.some(lambdasToCheckForChanges, {type:projectType, name: '*'})
        || _.some(lambdasToCheckForChanges, {type:projectType, name: projectName});
}

var fetchCodeChangesFromPR = module.exports.fetchCodeChangesFromPR = function(callback) {
    var changedFiles = [];

    if (!process.env.CI_PULL_REQUESTS) {
        lambdasToCheckForChanges = [{type: '*'}];
        callback();
        return;
    }
    console.log('');
    console.log('Fetching code changes on swf lambdas from GitHub Pull Requests : ' + process.env.CI_PULL_REQUESTS + ')');

    if (!process.env.GITHUB_ACCESS_TOKEN) {
        console.error(color.red('The environment variable GITHUB_ACCESS_TOKEN is undefined.'));
        console.error(color.red('Please add a personal access token to your GitHub account and set the ' +
            'GITHUB_ACCESS_TOKEN environment variable on your CircleCi project settings'));
        cleanup();
        process.exit(1);
    }

    var github = new GitHubApi({
        protocol: "https",
        host: "api.github.com"
    });
    github.authenticate({
        type: "oauth",
        token: process.env.GITHUB_ACCESS_TOKEN
    });
    var series = [];
    process.env.CI_PULL_REQUESTS.split(',').forEach(function(prUrl) {
        series.push(function(prCallback) {
            var prData = /^.*\/github.com\/(.*)\/(.*)\/pull\/(.*)$/gi.exec(prUrl);
            var count = 100;
            var page = 1;
            async.whilst(
                function () { return (count == 100) },
                function (pageCallback) {
                    github.pullRequests.getFiles({
                        user: prData[1],
                        repo: prData[2],
                        number: prData[3],
                        per_page: 100,
                        page: page
                    }, function(err, res) {
                        if (err) {
                            console.error(color.red('Error while trying to get the list of files of the Pull Request from GitHub - ' + prUrl));
                            console.error(err);
                            cleanup();
                            process.exit(1);
                        }
                        count = res.length;
                        page++;
                        var files = _.map(res, 'filename');
                        changedFiles = changedFiles.concat(_.filter(files, function(file) {
                            return _.startsWith(file, 'swf/');
                        }));
                        pageCallback();
                    });
                },
                function (results, err) {
                    prCallback(results, err);
                }
            );
        });
    });

    series.push(function(filesCallback) {
        changedFiles = _.uniq(changedFiles);

        if (_.filter(changedFiles, function(file) {
            return _.startsWith(file, 'swf/templates/activities/');
        }).length > 0) {
            lambdasToCheckForChanges.push({type:'activities', name:'*'});
        } else {
            changedFiles.forEach(function(file) {
                if (_.startsWith(file, 'swf/activities/')) {
                    var d = /^swf\/activities\/(.*)\/.*$/gi.exec(file);
                    var lambda = {type:'activities', name:d[1]};
                    if (!_.some(lambdasToCheckForChanges, lambda)) {
                        lambdasToCheckForChanges.push(lambda);
                    }
                }
            })
        }

        if (_.filter(changedFiles, function(file) {
            return _.startsWith(file, 'swf/templates/deciders/');
        }).length > 0) {
            lambdasToCheckForChanges.push({type:'deciders', name:'*'});
        } else {
            changedFiles.forEach(function(file) {
                if (_.startsWith(file, 'swf/deciders/')) {
                    var d = /^swf\/deciders\/(.*)\/.*$/gi.exec(file);
                    var lambda = {type:'deciders', name:d[1]};
                    if (!_.some(this.lambdasToCheckForChanges, lambda)) {
                        lambdasToCheckForChanges.push(lambda);
                    }
                }
            })
        }
        filesCallback(lambdasToCheckForChanges);
    });

    async.series(series, function(results) {
        callback();
    });
}

var handleError = function(message, output, projectName, callback) {
    var continueOnFailure = options.continueOnFailure || false;

    console.error(color.red(message));
    if (!continueOnFailure) {
        console.error(output);
        cleanup();
        process.exit(1);
    } else {
        callback(null, { message: message, output: output, projectName: projectName});
    }
}

var deploy = module.exports.deploy = function(projectType, projectName, callback) {
    console.log('   updating the function aliases in lambda');

    var lambdaName = getLambdaName(projectType, projectName);
    var packageFile = __dirname + '/../' + projectType + '/' + projectName + '/package.json';
    var packageInfo = require(packageFile);

    getFullLambdaInfo(lambdaName, function(lambdaInfo) {
        if (!lambdaInfo) {
            var msg = 'The lambda function for ' + projectType + '/' + projectName + ' does not exist in Amazon';
            handleError(msg, '', projectType + '/' + projectName, callback);
            return;
        }
        var version = packageInfo.lambdaAttributes.version;
        if (!lambdaInfo.versions[version]) {
            var msg = 'The lambda version for ' + projectType + '/' + projectName + ' is ' + version + ' and it does not exist in Amazon';
            handleError(msg, '', projectType + '/' + projectName, callback);
            return;
        }
        if (lambdaInfo.aliases[config.domain]) {
            if (lambdaInfo.aliases[config.domain] != version) {
                updateLambdaAlias(lambdaName, version, function(data) {
                    callback();
                });
            } else {
                callback();
            }
        } else {
            createLambdaAlias(lambdaName, version, function(data) {
                callback();
            });
        }
    });
}

var registerCron = module.exports.registerCron = function(lambdaName, ruleName, schedule, input, callback) {
    console.log('Registering and starting the cron ' + ruleName);

    var cloudwatchevents = new AWS.CloudWatchEvents();

    lambda.getFunction({
        FunctionName: lambdaName,
        Qualifier: config.domain
    }, function(err, data) {
        if (err) {
            handleError('getLambdaFunction failed', err, lambdaName, callback);
            return;
        }
        var functionArn = data.Configuration.FunctionArn;

        cloudwatchevents.putRule({
          Name: ruleName,
          ScheduleExpression: schedule
        }, function(err, data) {
            if (err) {
                handleError('putRule failed', err, lambdaName, callback);
                return;
            }
            var ruleArn = data.RuleArn;

            lambda.addPermission({
                Action: 'lambda:InvokeFunction',
                FunctionName: functionArn,
                SourceArn: ruleArn,
                Principal: 'events.amazonaws.com',
                StatementId: ruleName + config.domain
            }, function (err, data) {
                if (err && err.code != 'ResourceConflictException') {
                    handleError('Unable to add lambda permissions for cron', err, lambdaName, callback);
                    return;
                }
                cloudwatchevents.putTargets({
                    Rule: ruleName,
                    Targets: [{
                        Arn: functionArn,
                        Id: ruleName + config.domain,
                        Input: JSON.stringify(input)
                    }]
                }, function(err, data) {
                    if (err) {
                        handleError('putTargets failed', err, lambdaName, callback);
                        return;
                    }
                    callback();
                });
            });
        });
    });
}

var unregisterCron = module.exports.unregisterCron = function(lambdaName, ruleName, callback) {
    console.log('Unregistering the cron ' + ruleName);

    var cloudwatchevents = new AWS.CloudWatchEvents();

    lambda.getFunction({
        FunctionName: lambdaName,
        Qualifier: config.domain
    }, function(err, data) {
        if (err) {
            handleError('getLambdaFunction failed', err, lambdaName, callback);
            return;
        }
        var functionArn = data.Configuration.FunctionArn;


        cloudwatchevents.listTargetsByRule({
          Rule: ruleName
        }, function(err, data) {
            if (err && err.code == 'ResourceNotFoundException') {
              callback();
              return;
            }
            if (err) {
                handleError('listTargetsByRule failed', err, lambdaName, callback);
                return;
            }
            var targets = data.Targets;
            var matchingTargets = _.filter(data.Targets, function(target) {
                return target.Arn == functionArn;
            });
            if (matchingTargets.length == 1) {
              console.log("removing the rule target");
              cloudwatchevents.removeTargets({
                Ids: [matchingTargets[0].Id],
                Rule: ruleName
              }, function(err, data) {
                  if (err) {
                      handleError('removeTargets failed', err, lambdaName, callback);
                      return;
                  }
                  if (targets.length == 1) {
                    console.log("removing the rule as this was the only target left on it");
                    cloudwatchevents.deleteRule({
                      Name: ruleName
                    }, function(err, data) {
                        if (err) {
                            handleError('deleteRule failed', err, lambdaName, callback);
                            return;
                        }
                        callback();
                    });
                  } else {
                    callback();
                  }
              });
            }
        });
    });
}

// Start a decision poller, and keep it going until we receive a SIGINT
// This is meant to be used on development environment.
// On production and staging, the poller is a lambda function scheduled with cloudwatch events
// to be run as a cron
var startPoller = module.exports.startPoller = function() {
    var Poller = require('./lib/poller').Poller;

    console.log("--- starting poller on domain " + config.domain + " (poller PID: " + process.pid + ")");
    AWS.config = new AWS.Config(config.aws);
    if (config.pollerCredentials) {
      console.log("--- setting up credentials for poller in development environment (poller PID: " + process.pid + ")");
      AWS.config.update(config.pollerCredentials);
    }

    var poller = new Poller({
        domain: config.domain,
        taskList: {name: "vreasyTaskList"},
        identity: "VreasyWFPoller",
        maximumPageSize: 100,
        reverseOrder: false // IMPORTANT: must replay events in the right order, ie. from the start
    });
    poller.maxPollCount = 0;

    poller.on('poll', function(d) {
        console.log("--- Polling for tasks on domain " + config.domain + " (poller PID: " + process.pid + ")");
    });

    poller.on('stopped', function(d) {
        // When the poller doesn't find more tasks, call it again to keep it working
        poller.poll();
    });

    poller.on('error', function(err) {
        console.log("--- Error while polling for tasks on domain " + config.domain + "... (poller PID: " + process.pid + ")", err);
        process.exit(0);
    });

    poller.on('shutdown', function(err) {
        console.log("--- Shutdown completed (poller PID: " + process.pid + ")");
    });

    process.on('SIGINT', function () {
        console.log("--- Got SIGINT ! Shutting down decider poller after this request... please wait... (poller PID: " + process.pid + ")");
        poller.shutDown();
    });

    poller.poll();
}

var cleanupLambda = module.exports.cleanupLambda = function(projectType, projectName, callback) {
    console.log('   deleting unused lambda versions');

    var lambdaName = getLambdaName(projectType, projectName);

    var dateLimit = new Date();
    var daysLimit = 15;
    dateLimit = new Date(dateLimit - 1000 * 60 * 60 * 24 * daysLimit);

    getFullLambdaInfo(lambdaName, function(lambdaInfo) {
        var toDelete = [];
        // Only delete versions not having any alias poiting to them AND older than 7 days
        _.filter(lambdaInfo.versions, function(versionInfo, version) {
            var c = _.filter(lambdaInfo.aliases, function(aliasVersion) {
                return aliasVersion == version;
            })
            var d = new Date(versionInfo.LastModified)
            if ((version != '$LATEST') && (c.length == 0) && (d < dateLimit)) {
                toDelete.push(version);
                return true;
            }
        })
        var series = [];
        toDelete.forEach(function (version) {
            series.push(function(deleteCallback) {
                console.log('   deleting version ' + version);
                deleteLambdaVersion(lambdaName, version, deleteCallback);
            });
        });
        async.series(series, function(results, err) {
            if (err && _.filter(_.flatten(err), function(e) { return (e !== undefined); }).length > 0) {
                callback(true, err);
            } else {
                callback();
            }
        });
    });
}

var registerWorkflow = module.exports.registerWorkflow = function(projectType, projectName, callback) {
    console.log('   registering the workflow in SWF');

    var lambdaName = getLambdaName(projectType, projectName);
    var packageFile = __dirname + '/../' + projectType + '/' + projectName + '/package.json';
    var packageInfo = require(packageFile);

    var swfClient = new AWS.SimpleWorkflow();
    var executionStartToCloseTimeout = packageInfo.swfAttributes.defaultExecutionStartToCloseTimeout || defaultSwfExecutionStartToCloseTimeout;
    var taskStartToCloseTimeout = packageInfo.swfAttributes.defaultTaskStartToCloseTimeout || defaultSwfTaskStartToCloseTimeout;
    var retention = packageInfo.swfAttributes.workflowExecutionRetentionPeriodInDays || defaultSwfWorkflowExecutionRetentionPeriodInDays;

    swfClient.registerDomain({
        name: config.domain,
        workflowExecutionRetentionPeriodInDays: retention
    }, function (err, results) {
        if (err && err.code != 'DomainAlreadyExistsFault') {
            handleError('Unable to register domain', err, projectType + '/' + projectName, callback);
            return;
        } else if (!err) {
            console.log('   domain ' + config.domain + ' successfully registered')
        }

        swfClient.registerWorkflowType({
            domain: config.domain,
            name: projectName,
            version: packageInfo.version,
            defaultTaskList: { "name": "vreasyTaskList" },
            defaultExecutionStartToCloseTimeout: executionStartToCloseTimeout,
            defaultTaskStartToCloseTimeout: taskStartToCloseTimeout,
            defaultChildPolicy: "TERMINATE",
            defaultLambdaRole: config.lambdaRole
        }, function (err, results) {
            if (err && err.code != 'TypeAlreadyExistsFault') {
                handleError('Unable to register workflow', err, projectType + '/' + projectName, callback);
                return;
            } else if (!err) {
                console.log('   workflow ' + projectName + ' successfully registered')
            }
            callback();
        });
    });
}

var test = module.exports.test = function(projectFolder, callback) {
    console.log('   running tests');
    var projectTmpFolder = tmpFolder + '/' + projectFolder;

    // Patch to allow execution of mocha
    fs.chmodSync(projectTmpFolder + '/node_modules/mocha/bin/mocha', 0777);
    var child = exec('./node_modules/mocha/bin/mocha --timeout 5000', {cwd: projectTmpFolder});
    var output = '';
    child.stdout.on('data', function(data) {
        output += data;
    });
    child.stderr.on('data', function(data) {
        output += data;
    });

    child.on('close', function(code) {
        if (code !== 0) {
            handleError('Test failed for ' + projectFolder, output, projectFolder, callback);
            return;
        } else {
            console.log(color.green('   successfully tested lambda ' + projectFolder));
            callback();
        }
    });
}

var validatePackageInfo = module.exports.validatePackageInfo = function(projectType, projectName, callback) {
    console.log('   validating package.json');
    var packageFile = __dirname + '/../' + projectType + '/' + projectName + '/package.json';
    var packageInfo = require(packageFile);

    // Check that the swfDefaultExecutionStartToCloseTimeout is greater than workflowCleanupTimeBeforeTimeout
    // because the workflows will fail workflowCleanupTimeBeforeTimeout seconds before the timeout is about to trigger
    // so that the workflow has time to properly finish
    var workflowCleanupTimeBeforeTimeout = packageInfo.swfAttributes.workflowCleanupTimeBeforeTimeout || defaultWorkflowCleanupTimeBeforeTimeout;
    var executionStartToCloseTimeout = packageInfo.swfAttributes.defaultExecutionStartToCloseTimeout || defaultSwfExecutionStartToCloseTimeout;
    if (parseInt(executionStartToCloseTimeout) <= parseInt(workflowCleanupTimeBeforeTimeout)) {
        handleError('executionStartToCloseTimeout must be greater than workflowCleanupTimeBeforeTimeout(' + workflowCleanupTimeBeforeTimeout + ')', '', projectType + '/' + projectName, callback);
        return;
    } else {
        callback();
    }
}

var copyFolder = module.exports.copyFolder = function(source, target, callback) {
    var child = exec('cp -Rpf '+ source + ' ' + target);
    var output = '';
    child.stdout.on('data', function(data) {
        output = output + data;
    });
    child.stderr.on('data', function(data) {
        output = output + data;
    });

    child.on('close', function(code) {
        if (code === 0) {
          callback()
        } else {
          handleError('copy folder failed', output, '', callback);
          return;
        }
    });
}

var deleteFolder = module.exports.deleteFolder = function(path, callback) {
    if (!fs.existsSync(path)) {
        if (callback) {
            callback()
        }
        return;
    }
    var child = exec('rm -rf '+ path);
    var output = '';
    child.stdout.on('data', function(data) {
        console.log(data)
        output = output + data;
    });
    child.stderr.on('data', function(data) {
        console.log(data)
        output = output + data;
    });

    child.on('close', function(code) {
        if (code === 0) {
            if (callback) {
                callback()
            }
        } else {
          handleError('delete folder failed', output, '', callback);
          return;
        }
    });
};
