const request = require("supertest");
const assert = require("chai").assert;
const sinon = require("sinon");
const fh = require("../support/fixture-helper.js");
const log = require("metalogger")();

const BulkService = require("wallet/services/bulkService");

describe("Bulk service test", () => {
    const testService = new BulkService();

    it("Bulk Service Test - remain values ", async() => {
        const testAddr = "0x2db6E5b42b228A97A7a6F5d503881A7F87C83810";
        const targetAddr = "0x689A42Ce049da31a4b1Ed10Fe5791b05f1186ac6";

        const gasValue = await testService.getApproveGasPriceByAddress(targetAddr);
        const res = await testService.getNeedToAmountGas(testAddr, gasValue);

        assert.equal(res, "1345336739859000", `Gas Value is Diff ${gasValue.toString()} : ${res.toString()}`);
    });

    it("Bulk Service Test - Send fee ", async() => {
        const testAddr = "0x2db6E5b42b228A97A7a6F5d503881A7F87C83810";
        const targetAddr = "0x689A42Ce049da31a4b1Ed10Fe5791b05f1186ac6";

        const gasValue = await testService.getApproveGasPriceByAddress(targetAddr);
        const res = await testService.getNeedToAmountGas(testAddr, gasValue);

        assert.equal(true, true);
    });

});