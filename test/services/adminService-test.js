const request = require("supertest");
const assert = require("chai").assert;
const sinon = require("sinon");
const fh = require("../support/fixture-helper.js");
const log = require("metalogger")();
const path = require("path");

require("app-module-path").addPath(path.join(__dirname, "../../lib"));

const ValueObserver = require("wallet/services/valueObserver");
const AdminService = require("wallet/services/adminService");

describe("Admin service test", () => {
    const observerService = new ValueObserver();
    const testService = new AdminService(observerService);

    it("Admin Service Test - remain values ", async() => {
        const testAddr = "0xfd6D98Be3Ac00C251Da66F9874D2cda378F5Cb8F";
        const targetAddr = "0x54c858B5E5c11A11095C74976E2A675734e7f9c6";

        const gasValue = await testService.calcTrasferFee(testAddr, targetAddr, 1000, 100);

        assert.equal(gasValue, "209163000000000", `Gas Value is Diff ${gasValue.toString()}`);
    });
});