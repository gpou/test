var assert = require('assert')
    activityFunction = require('../index.js').activityFunction
    Logger = require('../lib/logger.js');

var utils = require('./lib/utils');

utils.setEnvironment(activityFunction);

describe('Test', function(){
  var mocks = [];
  var now = '2016-02-01 10:00:00';

  it("should update a workflow with given id and set status and notes to something", function(done) {
    mocks.push({
      endpoint: 'Workflows',
      action: 'get_workflows',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, status: 'SCHEDULED'}});
      }
    });
    mocks.push({
      endpoint: 'Workflows',
      action: 'put_workflow',
      fn: function(params, success, error) {
        assert.equal(params.workflow.status, 'STARTED');
        var notes = {
          debug: [
            {date: new Date(now), status: 'STARTED'}
          ]
        };
        assert.equal(params.workflow.notes, JSON.stringify(notes));
        success({status: 200, obj: params});
      }
    });
    mocks.push({
      nowMock: now
    });

    utils.runActivity(
      {
        id: 100,
        workflow: {
          status: 'STARTED'
        }
      },
      mocks,
      function(error, response) {
        done();
      }
    );
  });

  it("should update a workflow with given workflow_run_id and set status and notes to something", function(done) {
    mocks.push({
      endpoint: 'Workflows',
      action: 'get_workflows',
      fn: function(params, success, error) {
        success({status: 200, obj: { id: 100, status: 'SCHEDULED'}});
      }
    });
    mocks.push({
      endpoint: 'Workflows',
      action: 'put_workflow',
      fn: function(params, success, error) {
        assert.equal(params.workflow.status, 'STARTED');
        var notes = {
          debug: [
            {date: new Date(now), status: 'STARTED'}
          ]
        };
        assert.equal(params.workflow.notes, JSON.stringify(notes));
        success({status: 200, obj: params});
      }
    });
    mocks.push({
      nowMock: now
    });

    utils.runActivity(
      {
        run_id: 'fakeRunId',
        workflow: {
          status: 'STARTED'
        }
      },
      mocks,
      function(error, response) {
        done();
      }
    );
  });

  it("should update the workflow, set the status and add the debugging info into the notes", function(done) {
    mocks.push({
      endpoint: 'Workflows',
      action: 'get_workflows',
      fn: function(params, success, error) {
        var notes = {
          debug: [
            {date: '2016-02-16T14:05:52.435Z', status: 'STARTED'}
          ]
        };
        success({status: 200, obj: { id: 100, status: 'STARTED', notes: JSON.stringify(notes)}});
      }
    });
    mocks.push({
      endpoint: 'Workflows',
      action: 'put_workflow',
      fn: function(params, success, error) {
        assert.equal(params.workflow.status, 'COMPLETED');
        var notes = {
          debug: [
            {date: '2016-02-16T14:05:52.435Z', status: 'STARTED'},
            {date: new Date(now), status: 'COMPLETED', note: 'This is some debug info for the completed status change'}
          ]
        };
        assert.equal(params.workflow.notes, JSON.stringify(notes));
        success({status: 200, obj: params});
      }
    });
    mocks.push({
      nowMock: now
    });

    utils.runActivity(
      {
        run_id: 100,
        debug_note: 'This is some debug info for the completed status change',
        workflow: {
          status: 'COMPLETED'
        }
      },
      mocks,
      function(error, response) {
        done();
      }
    );
  });
});
