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

    it("Admin Service Test - Real values ", async() => {
        const testAddr = "0x54c858B5E5c11A11095C74976E2A675734e7f9c6";
        const targetAddr = "0xfd6D98Be3Ac00C251Da66F9874D2cda378F5Cb8F";

        const gasValue = await testService.calcTransferFee(testAddr, targetAddr, 1000, 100);

        assert.equal(gasValue, "2263237000000000", `Gas Value is Diff ${gasValue.toString()}`);
    });

    it("Admin Service Test - Displayed values ", async() => {
        const testAddr = "0x54c858B5E5c11A11095C74976E2A675734e7f9c6";
        const targetAddr = "0xfd6D98Be3Ac00C251Da66F9874D2cda378F5Cb8F";

        const gasValue = await testService.getDisplayiedFeeAmount(testAddr, targetAddr, 1000, 100);

        assert.equal(gasValue, "21", `Gas Value is Diff ${gasValue.toString()}`);
    });
});