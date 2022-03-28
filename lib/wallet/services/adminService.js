const db = require("datastore");
const log = require('metalogger')();
const Promise = require('bluebird');
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const srtAbi = require("./srtAbi");
const axios = require("axios");
const retry = require("retry");
const { delay } = require("bluebird");
const { transfer } = require("../controllers/actions");

class AdminService {
    constructor() {
        this.DECIMAL = 18;
        this.tokenAddress = "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91";

        this.web3 = createAlchemyWeb3(
            "https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ"
        );
        this.srtContract = new this.web3.eth.Contract(srtAbi, this.tokenAddress);

        this.approveMaxValue = this.web3.utils.toBN("15000000000000000000000000000");
    }

    async getBalance(address) {
        return await this.srtContract.methods.balanceOf(address).call();
    }

    async isNotAllowance(fromAddress, toAddress) {
        const isAllow = await this.srtContract.methods.allowance(fromAddress.address, toAddress.address).call();
        if (isAllow == 0) {
            return true;
        } else {
            return false;
        }
    }

    async transferFee(fromAccount, toAccount) {
        return await this.executeTxFeeTxRetry(fromAccount, toAccount);
    }

    async approve(fromAccount, toAccount) {
        const approveAbi = await this.genApproveAbi(toAccount);
        const approveGasPrice = await this.getApproveGasPrice(fromAccount, toAccount);

        return await this.executeTx(fromAccount, approveAbi, approveGasPrice);
    }

    async getGasPrice(gasType) {
        const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
        return feeRes.data.result[gasType];
    }

    async transferToken(fromAcnt, toAddr, amount) {
        const transferAbi = await this.getTransferAbi(toAddr, amount);
        const transferGasPrice = await this.getTransferGasPrice(fromAcnt.address, toAddr, amount);

        return await this.executeTx(fromAcnt, transferAbi, transferGasPrice);
    }

    async executeTx(fromAcnt, encodedAbi, gasPrice) {
        const op = retry.operation();
        return new Promise((resolve, reject) => {
            op.attempt(async currentAttempt => {
                await delay(1000);
                log.info(`Attemps : ${currentAttempt}`);

                const signedTx = await this.genGeneralSignTx(fromAcnt, encodedAbi, gasPrice);
                const result = await this.web3.eth
                    .sendSignedTransaction(signedTx.rawTransaction).then((rep) => {
                        log.info("Resolved");
                        resolve(rep.transactionHash);
                    })
                    .catch((error) => {
                        if (currentAttempt > 5) {
                            reject(op.mainError());
                        } else {
                            op.retry(error);
                            return;
                        }
                    });
            });
        });
        // return await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        //     .once('error', (error) => { log.error(error); })
        //     .catch(function(error) {
        //         log.error(error);
        //     });
    }

    async executeTxFeeTxRetry(fromAct, toAct) {
        const op = retry.operation();
        return new Promise((resolve, reject) => {
            op.attempt(async currentAttempt => {
                log.info('Execute Tx Transfer FEE');
                await delay(2000);
                const estimatedGas = await this.getApproveGasPrice(fromAct, toAct);

                const calcFee = await this.getGasPrice("ProposeGasPrice");
                const calcFastFee = await this.getGasPrice("FastGasPrice");
                const calcGasPrice = this.web3.utils.toWei(String(Math.floor(parseFloat(calcFee) * estimatedGas * 1.1)), 'gwei');
                const transferFee = this.web3.utils.toWei(String(Math.floor(parseFloat(calcFastFee))), 'gwei');
                log.info(`gasPrice (Gwei) : ${calcFee}`);
                log.info(`Calc Gas Price : ${calcGasPrice} wei`);

                const transferTx = await this.web3.eth.accounts
                    .signTransaction({
                            from: fromAct.address,
                            gas: estimatedGas,
                            to: toAct.address,
                            gasPrice: transferFee,
                            value: calcGasPrice
                        },
                        fromAct.privateKey,
                        false);

                const result = await this.web3.eth
                    .sendSignedTransaction(transferTx.rawTransaction).then((rep) => {
                        log.info("Resolved");
                        resolve(rep.transactionHash);
                    })
                    .catch((error) => {
                        if (currentAttempt > 5) {
                            reject(op.mainError());
                        } else {
                            op.retry(error);
                            return;
                        }
                    });
            });
        });
    }

    async genLockAbi(toAddress) {
        return await this.srtContract.methods
            .addToBlacklist(toAddress)
            .encodeABI();
    }

    async genLockWallesAbi(toAddresses) {
        return await this.srtContract.methods
            .addManyToBlacklist(toAddresses)
            .encodeABI();
    }

    async genLockWalletsGasPrice(fromAccount, toAddresses) {
        return await this.srtContract.methods
            .addManyToBlacklist(toAddresses)
            .estimateGas({ from: fromAccount.address });
    }

    async genLockGasPrice(fromAccount, toAddress) {
        return await this.srtContract.methods
            .addToBlacklist(toAddress)
            .estimateGas({ from: fromAccount.address });
    }

    async genApproveAbi(toAccount) {
        return await this.srtContract.methods
            .approve(toAccount.address, this.approveMaxValue)
            .encodeABI();
    }

    async getApproveGasPrice(fromAccount, toAccount) {
        return await this.srtContract.methods
            .approve(toAccount.address, this.approveMaxValue)
            .estimateGas({ from: fromAccount.address });
    }

    async getTransferAbi(toAddr, amount) {
        const amountValue = this.convertAmount(amount);

        return await this.srtContract.methods
            .transfer(toAddr, amountValue)
            .encodeABI();
    }

    async getTransferGasPrice(fromAddr, toAddr, amount) {
        const amountValue = this.convertAmount(amount);

        return await this.srtContract.methods
            .transfer(toAddr, amountValue)
            .estimateGas({ from: fromAddr });
    }


    async isLocked(toAddress) {
        return await this.srtContract.methods.blacklist(toAddress).call();
    }

    async genSignTx(fromAccount, toAccount, encodeABI) {
        const estimateGasPrice = await this.getGasPrice("ProposeGasPrice");
        const estimateGas = await this.getApproveGasPrice(fromAccount, toAccount);
        const calcGasPrice = this.web3.utils.toWei(String(Math.floor(parseFloat(estimateGasPrice))), 'gwei');

        return await this.web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: fromAccount.address,
                gas: estimateGas,
                gasPrice: calcGasPrice,
                to: this.tokenAddress
            },
            fromAccount.privateKey,
            false
        );
    }

    async genGeneralSignTx(fromAccount, encodeABI, gasPrice) {
        const estimateGasPrice = await this.getGasPrice("ProposeGasPrice");
        const calcGasPrice = this.web3.utils.toWei(String(Math.floor(parseFloat(estimateGasPrice))), 'gwei');
        const nonceVal = await this.web3.eth.getTransactionCount(
            fromAccount.address,
            "latest"
        );

        return await this.web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: fromAccount.address,
                gas: gasPrice,
                gasPrice: calcGasPrice,
                to: this.tokenAddress,
                nonce: nonceVal
            },
            fromAccount.privateKey,
            false
        );
    }

    async lockWallet(ownerAct, toAddress) {
        const encodedAbi = await this.genLockAbi(toAddress);
        const gasPrice = await this.genLockGasPrice(ownerAct, toAddress);
        return await this.sendTxWithRetry(ownerAct, encodedAbi, gasPrice);
    }

    async lockWallets(ownerAct, toAddresses) {
        const encodedAbi = await this.genLockWallesAbi(toAddresses);
        const gasPrice = await this.genLockWalletsGasPrice(ownerAct, toAddresses);
        return await this.sendTxWithRetry(ownerAct, encodedAbi, gasPrice);
    }

    async sendTxWithRetry(fromAct, encodeABI, gasPrice) {
        const op = retry.operation();
        return new Promise((resolve, reject) => {
            op.attempt(async currentAttempt => {
                await delay(2000);
                const signedTx = await this.genGeneralSignTx(fromAct, encodeABI, gasPrice);
                const result = await this.web3.eth
                    .sendSignedTransaction(signedTx.rawTransaction)
                    .catch((error) => {
                        op.retry(error);
                        return;
                    });
                log.info(result.transactionHash);
                resolve(result);
            });
        });
    }

    convertAmount(amount) {
        const decimalBN = this.web3.utils.toBN(this.DECIMAL);
        const amountBN = this.web3.utils.toBN(amount);

        return amountBN.mul(this.web3.utils.toBN(10).pow(decimalBN));
    }
}

module.exports = AdminService;