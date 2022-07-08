const server = require('nodebootstrap-server'),
    express = require('express'),
    healthcheck = require('maikai'),
    appConfig = require('../../appConfig');

exports.beforeEach = function(app, callback) {
    server.setupTest(app, function(app) {
        // For Liveness Probe, defaults may be all you need.
        const livenessCheck = healthcheck();
        app.use(livenessCheck.express());

        // For readiness check, let's also test the DB
        const check = healthcheck({ path: "/ping" });
        const AdvancedHealthcheckers = require("healthchecks-advanced");
        const advCheckers = new AdvancedHealthcheckers();
        // Database health check is cached for 10000ms = 10 seconds!
        check.addCheck("db", "dbQueryCheck", advCheckers.dbQueryCheck, { minCacheMs: 10000 });
        app.use(check.express());

        appConfig.setup(app, callback);
    });
};

exports.express = function() {
    return express();
};