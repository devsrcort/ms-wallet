const request = require("supertest");
const assert = require("chai").assert;
const sinon = require("sinon");
const fh = require("../support/fixture-helper.js");
const log = require("metalogger")();
const path = require("path");

require("app-module-path").addPath(path.join(__dirname, "../../lib"));

const TransactionService = require("wallet/services/transactionService");

describe("Transaction service test", () => {
    const testService = new TransactionService();

    it("Transaction service - Intialize Databases", async() => {
        const testAddress = "0x54c858B5E5c11A11095C74976E2A675734e7f9c6";
        const isCreateTx = await testService.isCreatedTransaction();
        
        if (isCreateTx)
            await testService.clearTransactions();

        testService.createTransaction();
        
    });
});
