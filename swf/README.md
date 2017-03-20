# SWF Workflows

## Domains and aliases

When a workflow execution is started, it will be called on a SWF domain. Then, this domain will
be propagated to all the lambda calls, by calling for each function the alias that matches the domain.

We will have the domains/aliases 'production' and 'staging', but also one for every developer named
'development[Username]'

The domains allow the worflow executions to be completely independent on every domain.

The aliases in the lambda functions will allow us to work on different versions of the functions,
but will also be used to construct the baseUrl for the Vreasy endpoints.
For development environment, the baseUrl will be the one publicly available via vagrant-share.

So, if a lambda function called with an alias 'developmentGemmapou' makes a call to a Vreasy
endpoint, it will call 'http://gemmapou.vagrant.vreasy.com'

The first thing that every developer must do is to choose a unique username to work with.

Domains/aliases will be constructed by reading the environment variable APPLICATION_ENV,
and if it is 'development', appending your username, capitalized (ex: developmentGemmapou).
Your username will be read from another environment variable WF_SUBDOMAIN.


### Note about Lambda functions and versions

Every time we make changes on a function, we will need to upload it to Lambda by using the build script.
This will create the zip, upload it to Lambda, and generate a new version. Then, the lambdaVersion variable
on the function's package.json will be updated to the new version.

This step must be done from our development machine (not vagrant)

Then, during a provision (or by using the deploy script), our alias for that function will be created or updated

Later, when deploying the changes to staging or production, the staging/production aliases will be created or updated


## CircleCi environment variables needed to run the tests

If you are going to use branches of the vreasy app on your own repo and not on the vreasy one,
the workflow tests will fail unless you add some environment variables to your circle settings.

1. Go to the [settings page in GitHub](https://github.com/settings/tokens) and create a new personal access token.

2. Go to Circle > Project settings - Environment variables - https://circleci.com/gh/[your-circle-username]/vreasy/edit#env-vars
and add the following env vars:
    ```text
    AWS_ACCESS_KEY_ID: [your aws access key]
    AWS_SECRET_ACCESS_KEY: [your aws secret]
    GITHUB_ACCESS_TOKEN: [your GitHub personal access token]
    ```


## Preparing your environment

1. Choose your username to be used for SWF domains and Lambda aliases, and add a new environment
variable to /deploy/vagrant/stack-custom.json (the username must be capitalized).
Also add your AWS credentials.
    ```json
    {
      "deploy": {
        "vreasy": {
          "environment_variables": {
            ...
            "WF_SUBDOMAIN": "[Username]",
            "AWS_ACCESS_KEY_ID": "[AWS_ACCESS_KEY_ID]",
            "AWS_SECRET_ACCESS_KEY": "[AWS_SECRET_ACCESS_KEY]"
          },
          "environment": {
            ...
            "WF_SUBDOMAIN": "[Username]",
            "AWS_ACCESS_KEY_ID": "[AWS_ACCESS_KEY_ID]",
            "AWS_SECRET_ACCESS_KEY": "[AWS_SECRET_ACCESS_KEY]"
          }
        },
        ...
    }
    ```

2. Provision your vagrant machine so that it has the new environment variables
    ```sh
    vagrant provision
    ```

3. If you are going to use the workflows, add the deploy script to the git postCheckout hook.
This script will create the needed aliases in Lambda to work with the checked out branch.
You can also run the deploy script later whenever you want to use the workflows
    ```ruby
    if is_branch
      if system("vagrant ssh -c hostname", out: $stdout, err: :out)
        ...
      else
        ...
      end
      system('echo " * Updating the workflow aliases..."')
      system("if test -d swf/scripts; then cd swf/scripts; npm install; node deploy --continueOnFailure; fi")
    end
    ```

4. If you are going to run the workflows from your vagrant machine, you will need to share
your box online. Note that here the username is NOT capitalized. Then make sure that you can access
your vagrant box from http://[username].vagrant.vreasy.com
    ```sh
    vagrant share --domain vagrant.vreasy.com --name=[username]
    ```


### Additional steps needed when working on workflows

The following steps are only needed if you are going to add/update workflows or activities. They
are not needed for a normal use of the Vreasy app in development environment.

Functions in lambda use the version 4.3 of node, so we need to setup our host machine to have 2
different versions of node, one for vreasy application and the other for using the workflows scripts.

We are going to run the scripts from the host machine and not from vagrant so that we don't need to
install nvm on the vagrant box. This way, the vagrant box will be exactly the same that we have
in staging/production, since there we don't need multiple versions of node (we only need them
when developing workflows, but not for their use)

1. Set the APPLICATION_ENV and WF_SUBDOMAIN variable on your shell to be used by the workflow scripts.
Note that here your username must be capitalized.
Grab the oauth_key and oauth_secret values from your database (find an entry in consumer_api_key having
agent='vreasy' and url='https://workflows.vreasy.com')
    ```sh
    APPLICATION_ENV=development
    export APPLICATION_ENV
    WF_SUBDOMAIN=[Username]
    export WF_SUBDOMAIN
    VREASY_OAUTH_KEY=[oauth_key]
    export VREASY_OAUTH_KEY
    VREASY_OAUTH_SECRET=[oauth_secret]
    export VREASY_OAUTH_SECRET
    ```

2. Setup your AWS credentials in ~/.aws/credentials

    ```
    [default]
    aws_access_key_id = [your aws access key]
    aws_secret_access_key = [your aws secret]
    ```

3. Install [nvm](http://dev.topheman.com/install-nvm-with-homebrew-to-use-multiple-versions-of-node-and-iojs-easily/)
4. Install node versions 0.12.10 and 4.3.2, both of them with npm 3.10.7

    ```sh
    nvm install 4.3.2
    npm install npm@3.10.7 -g
    nvm install 0.12.10
    npm install npm@3.10.7 -g
    nvm alias default 0.12.10
    ```

5. Set the node version to 4.3.2, which is the version needed by the workflow scripts used during development
    ```sh
    nvm use 4.3.2
    ```

6. When you finish working on the workflows, reset node to version 0.12.10 so that the vreasy app has
the correct version
    ```sh
    nvm use default
    ```



## Code structure

The swf folder contains the following subfolders.
- activities : contains all the activities
- deciders : contains all de deciders, one for each workflow
- scripts : contains the scripts to test, build, upload, and deploy the workflows and its activities
- templates : templates used for testing and building the lambda functions
- callLambdaWithAlias : a special intermediary function needed to call lambda functions with an alias from SWF
- decisionPoller : a special lambda function that is run as a lambda cron to poll for decision tasks for production/staging


## The scripts

During development, we will run the scripts from our host machine, and not from vagrant, because of
the node versions conflict.

The only cases where scripts will be run from other places is:

1. During a deploy in staging/production or during a provision in vagrant. This is not a problem
because the deploy script can be run with node version 0.12.10

2. When running tests on circle (but the circle configuration already takes care of using the
correct node version for every action)


### generate.js

To be used when we need to start working on a new activity or decider.

This script will make a copy of templates/activitiesGenerator or templates/decidersGenerator and put it
on the activities or deciders folder


```sh
node swf/scripts/generate --type [activities/deciders] --name [yourFunctionName]
```

- type (required): activities or deciders
- name (required): the name of your new function


### test.js

For every function to test (see params below), it will:

1. Make a copy of the templates/activities folder (or templates/deciders) into a temporal folder in swf/scripts/tmp
2. Copy (and merge) the real function folder into the temporal folder
3. For activities, add a .env file containing the environment variables VREASY_OAUTH_KEY and VREASY_OAUTH_SECRET
4. Run npm install on that folder
5. Run the tests in [functionPath]/tests
6. Check that the corresponding function and version exist in lambda (except if --skipVersionsCheck)
7. Verify that no changes were performed on the functions without calling the build script:
Generate a zip file to simulate an upload to lambda, and verify that the sha of the zip coincides with
the one in lambda (except if --skipCodeChangesCheck)
    - If an environment variable CI_PULL_REQUESTS is found, it means that the test is run from CircleCi.
    In this case, it will fetch the list of changed files on the PR and will check only the
    lambdas that changed.
    - If the script is run outside CircleCI or if no PR is found, then it will check all the lambdas.
8. Perform a request to the corresponding host /api/account by using the oauth credentials, to make sure they are correct  (except if --skipOauthCredentialsCheck)

```sh
node swf/scripts/test [--type [activities/deciders]] [--name [yourFunctionName]]
```
- type: (optional) activities or deciders (if not present, it will test all functions)
- name: (optional) the name of the function to test (only if --type is also present)
- continueOnFailure: wether to exit on failure, or to run all tests and display the errors at the end
- skipVersionsCheck: the version to be used in lambda is defined on the package.json of every function.
The "build" script takes care of updating this version. The test script ckecks that the function exists in Lambda
and also the specific version defined in package.json. But we don't want to upload a new version while testing a new function,
so during development we will add --skipVersionsCheck. Then, once the changes are ready to be merged, circle will
run the tests and will complain if the lambda functions or versions don't exist.
- skipCodeChangesCheck: Without this parameter, the script will generate a zip as if it had to upload it to lambda,
and then will verify that the checksum of the zip is the same as the one in lambda. This is a slow process, so this step
will only be performed on circle tests for the lambdas that changed on the PR being evaluated.
- skipOauthCredentialsCheck: wether to verify that the oauth credentials are correct


### build.js

Builds and uploads a function to Lambda, and also registers the workflow types in SWF if needed.

1. Make a copy of the templates/activities folder (or templates/deciders) into a temporal folder in swf/scripts/tmp
2. Copy (and merge) the real function folder into the temporal folder
3. For activities, add a .env file containing the environment variables VREASY_OAUTH_KEY and VREASY_OAUTH_SECRET
4. Run npm install on that folder, with --production to skip the development packages used for tests
5. Generate a zip with the function code and dependencies and
6a. Check in lambda if the version specified in package.json already exists:
    1. Verify the sha256 of function in lambda against the one of the generated zip
    2. Skip the upload because the function and version already exists
6b. If the version in package.json does not exist in lambda:
    1. Read from lambda the next available version for the function
    2. Update the lambdaVersion value in package.json
    3. Regenerate the zip to include the updated package.json
    4. Upload the function to lambda
7. Create or update the lambda alias to be used on your development environment
8. If the function is a decider, register the workflow type in SWF, under the domain to be used on your
development environment (for the workflow version, it will use the value of "version" on the function's package.json)

```sh
node swf/scripts/build [--type [activities/deciders]] [--name [yourFunctionName]]
```
- type: (optional) activities or deciders (if not present, it will test all functions)
- name: (optional) the name of the function to test (only if --type is also present)


### deploy.js

For every activity and decider, creates or updates the Lambda aliases to point to the
current function versions. Also, register the workflow types in SWF if needed.

This script is automatically run during a provision and on the postCheckout git hook. You shouldn't
need to call it manually.

1. Create or update the lambda alias to be used on the current environment (development, staging or production)
2. If the function is a decider, register the workflow type in SWF, under the domain to be used on the
current environment (development, staging or production)
3. Start the decision poller for the current environment, which is a lambda function that uses Cloudwatch
events to be run as a cron (only if --registerPollerCron is present)

```sh
node swf/scripts/deploy [--type [activities/deciders]] [--name [yourFunctionName]]
```
- type: activities or deciders (if not present, it will test all functions)
- name: the name of the function to deploy (only if --type is also present)
- registerPollerCron: (false by default) wether or not to register and start the decision poller as a lambda cron

### poller.js

This script is used only on development environment to start the decision poller.

By using this script, we will not be using the lambda cron, but the poller will be run on our machine

```sh
node swf/scripts/poller
```



## Development lifecycle

Activites are located on the 'activities' folder, each activity in its own sub-folder.

When we need to work on activities or deciders, the usual workflow will be:

1. Make sure that you followed the [steps to start working on workflows](#additional-steps-needed-when-working-on-workflows)

2. If you didn't add the deploy script to the git postCheckout hook, you will need to run npm install
on the swf/scripts folder and run the deploy script manually so that the lambda aliases for your
environment match the current versions of the functions
    ```sh
    cd swf/scripts
    nvm use 4.3.2
    npm install
    cd ../..
    node swf/scripts/deploy --continueOnFailure
    ```

2. If you are adding a new activity/decider, use the generate script to get the code structure for the new function
    ```sh
    node swf/scripts/generate --type [activities/deciders] --name [yourFunctionName]
    ```

3. Write or update your function code in index.js

4. Write or update the tests for your function in test/test.js

5. Test your code locally
    ```sh
    node swf/scripts/test --skipVersionsCheck
    ```
    Or, if you prefer to test only your function:
    ```sh
    node swf/scripts/test --type [activities/deciders] --name [yourFunctionName] --skipVersionsCheck
    ```

6. Use the build script to package and upload the function to lambda and create the corresponding alias for your
development environment. **It is very important that you don't forget this step**
    ```sh
    node swf/scripts/build
    ```
    Or, if you prefer to test only your function to go faster:
    ```sh
    node swf/scripts/build --type [activities/deciders] --name [yourFunctionName]
    ```

7. If needed, test the workflow execution on your vagrant box.

    1. Share your vagrant box and make sure that you can access it from http://[username].vagrant.vreasy.com

        ```sh
          vagrant share --name=[username]
        ```

    2. Start the decision poller

        ```sh
          node swf/scripts/poller
        ```

    3. Start a workflow execution either from the Vreasy UI or with a POST request to the workflows endpoint

        ```sh
          echo '[params]' | curl -d @- -u "[authentication]" -X POST "http://[your-vagrant-share-name].vagrant.vreasy.com/api/workflows
        ```

        - authentication: either "[your-api-key]:" or "[username]:[password]"
        - params: json expression with the parameters to send to the worklow, along with some values to initialize the workflow instance.

            Ex: {"workflow_name": "[yourWorkflow], "resource_id": "[resouceId]", "resource_type": "[resourceType]", "workflow_input": [yourWorkflowInputParameters]}
            - workflow_name (required): the workflow to run
            - resource_id: the resource id that the workflow will operate on, if any
            - resource_type: the resource type that the workflow will operate on, if any (Worldhomes_User / Worldhomes_User_Host / Worldhomes_User_Provider)
            - workflow_input: json expression containing the input parameters needed by the workflow, if any

8. When we push your code to github, make sure that the circle tests are passing (they will check
that the needed Lambda functions have been uploaded)

9. Once you have merged your code and a deploy has been run in staging/production, the deploy script
will be called to create or update the staging or production aliases in Lambda

10. When you finish working on the workflows, reset node to version 0.12.10 so that the vreasy app has
the correct version
    ```sh
    nvm use default
    ```


## Vreasy endpoints requests performed from the activities

The 'templates/lib/resource.js' defines a Resource class that extends [swagger-js](https://github.com/swagger-api/swagger-js)

It loads the Vreasy endpoints structure from [VreasyHost]/docs/swagger.json

It is important to keep in mind that the swagger-js package does not allow to send other parameters
than those defined on the swagger structure. So, for example, pagination parameters need to be
defined on the vreasy swagger.json

When we add a new endpoint call, we must ensure that all the parameters that we send are defined
on the swagger annotations of that endpoint






### Debugging. Analising the logs

The decider poller will display logs on screen. (TODO: once the poller is in Lambda, the logs
will be found at Cloudwatch)

The deciders and activities will send logs to [Cloudwatch](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logs:)
into log groups named 'aws/lambda/decider[yourDecider]' and 'aws/lambda/activity[yourActivity]'

You can also view the executions and all of its events in [Swf console](https://console.aws.amazon.com/swf/home?region=us-east-1#search_executions:oldest_date=0;latest_date=0)

