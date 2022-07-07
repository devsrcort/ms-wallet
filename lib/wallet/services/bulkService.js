const log = require("metalogger")();
const Promise = require("bluebird");
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const srtAbi = require("./srtAbi");
const axios = require("axios");
const retry = require("retry");
const { delay } = require("bluebird");
const TxEmitterService = require("./txEmitterService");

class BulkService {
    constructor() {
        this.DECIMAL = 18;
        this.tokenAddress = "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91";
        const apiBase = "https://eth-mainnet.alchemyapi.io/v2/";
        const apiUrl = apiBase + "0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ";

        this.web3 = createAlchemyWeb3(apiUrl);
        this.srtContract = new this.web3.eth.Contract(srtAbi, this.tokenAddress);
        this.approveMaxValue = this.web3.utils.toBN(
            "15000000000000000000000000000"
        );
        this.gasPrice = undefined;

        setInterval(
            async function() {
                const query = {
                    module: "",
                    action: "",
                    apikey: "98NGW4ER18YRCFIYZG74X6YWZ46IUHCHAM",
                };
                const feeRes = await axios
                    .get("https://api.etherscan.io/api", {
                        params: {
                            module: "gastracker",
                            action: "gasoracle",
                            apikey: "98NGW4ER18YRCFIYZG74X6YWZ46IUHCHAM",
                        },
                    })
                    .catch((error) => {
                        log.error(error.message);
                    });
                this.gasPrice = feeRes.data.result;
            }.bind(this),
            1000
        );

        const successHandler = function(result, job) {
            log.info(`Tx Hash : ${result.transactionHash}`);
        };

        this.txEmitter = new TxEmitterService();
        this.txEmitter.addSuccessCallback(successHandler);

        this.stndGasPrice = 30;
    }

    async emitSendFeeByAdminBulk(ownerAccount, account) {
        return this.txEmitter.push(
            this.sendFeeByAdminBulk(ownerAccount, account)
        );
    }

    async emitApproveByAdminBuk(ownerAccount, account) {
        return this.txEmitter.push(
            this.approveByAdminBuk(ownerAccount, account)
        );
    }

    async sendFeeByAdminBulk(ownerAccount, account) {
        const targetContract = "0x689A42Ce049da31a4b1Ed10Fe5791b05f1186ac6";
        const gasValue = await this.getApproveGasPriceByAddress(targetContract);
        log.info(`GasValue is ${gasValue}`);
        const op = retry.operation({
            retries: 255,
            factor: 1,
        });

        return new Promise((resolve, reject) => {
            op.attempt(
                async function(currentAttempt) {
                    await delay(2000);
                    log.info(`Attemps: ${currentAttempt}`);
                    const estimateGasVal = this.getGasPrice("FastGasPrice");
                    if (estimateGasVal > this.stndGasPrice) {
                        await delay(2000);
                        log.info(`Gas is expensive : ${estimateGasVal}`);
                        op.retry(true);
                        return;
                    }

                    const calcFastFee = this.getGasPrice("FastGasPrice");
                    const transferFee = this.web3.utils.toWei(
                        String(Math.floor(parseFloat(this.stndGasPrice))),
                        "gwei"
                    );

                    const needGasAmount = await this.getNeedToAmountGas(account.address, gasValue);

                    log.info(`Address is ${account.address}`);
                    log.info(`needGasAmount is ${needGasAmount.toString()}`);

                    if (needGasAmount == "0") {
                        resolve("Need not to transfer gas");

                    } else {
                        const nonceVal = await this.web3.eth.getTransactionCount(
                            ownerAccount.address,
                            "pending"
                            // "latest"
                        );

                        const transferTx = await this.web3.eth.accounts.signTransaction({
                                from: ownerAccount.address,
                                gas: 21000,
                                to: account.address,
                                gasPrice: transferFee,
                                value: needGasAmount,
                                nonce: nonceVal,
                            },
                            ownerAccount.privateKey,
                            false
                        );

                        await this.web3.eth
                            .sendSignedTransaction(transferTx.rawTransaction)
                            .then((rep) => {
                                log.info("Resolved");
                                resolve(rep.transactionHash);
                            })
                            .catch((error) => {
                                op.retry(error);
                                return;
                            });
                    }
                }.bind(this)
            );
        });
    }

    async approveByAdminBuk(ownerAccount, account) {
        const targetContract = "0x689A42Ce049da31a4b1Ed10Fe5791b05f1186ac6";
        const gasValue = await this.getApproveGasPrice(targetContract);
        log.info(`GasValue is ${gasValue}`);

        const encodedAbi = await this.genApproveAbi(targetContract);
        const op = retry.operation({
            retries: 255,
            factor: 1,
        });

        return new Promise((resolve, reject) => {
            op.attempt(
                async function(currentAttempt) {
                    await delay(2000);
                    log.info(`Attemps: ${currentAttempt}`);
                    const estimateGasVal = this.getGasPrice("FastGasPrice");
                    if (estimateGasVal > this.stndGasPrice) {
                        await delay(2000);
                        log.info(`Gas is expensive : ${estimateGasVal}`);
                        op.retry(true);
                        return;
                    }

                    const signedTx = await this.genGeneralSignTx(
                        account,
                        encodedAbi,
                        gasValue
                    );

                    log.info(`Address is ${account.address}`);

                    await this.web3.eth
                        .sendSignedTransaction(signedTx.rawTransaction)
                        .then((rep) => {
                            log.info("Resolved");
                            resolve(rep);
                        })
                        .catch((error) => {
                            log.error(error.message);
                            if (op.retry(error)) {
                                return;
                            }
                        });
                }.bind(this)
            );
        });
    }

    async getApproveGasPriceByAddress(targetAddress) {
        const estimatedGas = await this.srtContract.methods
            .approve(targetAddress, this.approveMaxValue)
            .estimateGas();

        return this.web3.utils.toWei(String(Math.floor(this.stndGasPrice * estimatedGas)), "gwei");
    }

    async getNeedToAmountGas(address, gasValue) {
        const gasValueBN = this.web3.utils.toBN(gasValue);
        const balanceInWallet = this.web3.utils.toBN(await this.web3.eth.getBalance(address));

        return gasValueBN.gt(balanceInWallet) ? gasValueBN.sub(balanceInWallet).toString() : "0";
    }

    async getEthBalance(address) {
        return await this.web3.eth.getBalance(address);
    }

    getGasPrice(gasType) {
        return process.env.NODE_ENV == "production" ? this.gasPrice[gasType] : 3;
    }

    async genApproveAbi(address) {
        return await this.srtContract.methods
            .approve(address, this.approveMaxValue)
            .encodeABI();
    }

    async genGeneralSignTx(fromAccount, encodeABI, gasPrice) {
        const calcGasPrice = this.web3.utils.toWei(
            String(Math.floor(this.stndGasPrice)),
            "gwei"
        );

        const nonceVal = await this.web3.eth.getTransactionCount(
            fromAccount.address,
            // "pending"
            "latest"
        );

        return await this.web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: fromAccount.address,
                gas: gasPrice,
                gasPrice: calcGasPrice,
                to: this.tokenAddress,
                nonce: nonceVal,
            },
            fromAccount.privateKey,
            false
        );
    }

    async getApproveGasPrice(toAddress) {
        return await this.srtContract.methods
            .approve(toAddress, this.approveMaxValue)
            .estimateGas();
    }
}

module.exports = BulkService;