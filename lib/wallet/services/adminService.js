const db = require("datastore");
const log = require("metalogger")();
const Promise = require("bluebird");
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const srtAbi = require("./srtAbi");
const axios = require("axios");
const retry = require("retry");
const { delay } = require("bluebird");
const { transfer } = require("../controllers/actions");
const MnemonicService = require("./mnemonic");
const Wallet = require("ethereumjs-wallet").default;
const { hdkey } = require("ethereumjs-wallet");
const EthereumUtil = require("ethereumjs-util");
const TxEmitterService = require("./txEmitterService");

class AdminService {
    constructor() {
        this.DECIMAL = 18;
        this.tokenAddress =
            process.env.NODE_ENV == "production" ?
            "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91" :
            "0x19D6872C7Fc65E70a3b715470845918D8917b178";

        // const apiUrl = `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_APIKEY}`;
        const apiBase = process.env.NODE_ENV == "production" ?
            "https://eth-mainnet.alchemyapi.io/v2/" :
            "https://eth-goerli.alchemyapi.io/v2/";

        const apiUrl =
            apiBase + process.env.ALCHEMY_APIKEY;

        this.web3 = createAlchemyWeb3(apiUrl);
        this.srtContract = new this.web3.eth.Contract(srtAbi, this.tokenAddress);
        this.approveMaxValue = this.web3.utils.toBN(
            "15000000000000000000000000000"
        );

        this.gasPrice = undefined;
        this.srtPrice = 0;

        setInterval(
            async function() {
                const query = {
                    module: "",
                    action: "",
                    apikey: process.env.ETHSCAN_APIKEY,
                };
                const feeRes = await axios.get(
                        "https://api.etherscan.io/api", {
                            params: {
                                "module": "gastracker",
                                "action": "gasoracle",
                                "apikey": process.env.ETHSCAN_APIKEY
                            }
                        }
                    )
                    .catch((error) => { log.error(error.message); });
                this.gasPrice = feeRes.data.result;
            }.bind(this),
            1000
        );

        setInterval(
            async function() {
                const srtPrice = await axios.get(
                        "https://api.mexc.com/api/v3/ticker/bookTicker", {
                            params: {
                                "symbol": "SRTUSDT"
                            }
                        }
                    )
                    .catch((error) => { log.error(error.message); });
                this.srtPrice = srtPrice.data.askPrice;
            }.bind(this),
            1000
        );

        const successHandler = function(result, job) {
            log.info(`Tx Hash : ${result.transactionHash}`);
        };

        this.txEmitter = new TxEmitterService();
        this.txEmitter.addSuccessCallback(successHandler);

    }

    async getBalance(address) {
        return await this.srtContract.methods.balanceOf(address).call();
    }

    async isNotAllowance(fromAddress, toAddress) {
        const isAllow = await this.srtContract.methods
            .allowance(fromAddress.address, toAddress.address)
            .call();
        if (isAllow == 0) {
            return true;
        } else {
            return false;
        }
    }

    async isLocked(addr) {
        return await this.srtContract.methods.blacklist(addr).call();
    }

    async transferFee(fromAccount, toAccount) {
        return await this.executeTxFeeTxRetry(fromAccount, toAccount);
    }

    async getAccountByPk(pk) {
        return await this.web3.eth.accounts.privateKeyToAccount(pk);
    }

    async approve(fromAccount, toAccount) {
        const approveAbi = await this.genApproveAbi(toAccount);
        const approveGasPrice = await this.getApproveGasPrice(
            fromAccount,
            toAccount
        );

        return await this.executeTx(fromAccount, approveAbi, approveGasPrice);
    }

    getGasPrice(gasType) {
        const msg = process.env.NODE_ENV == "production" ? this.gasPrice[gasType] : "Dev";
        return process.env.NODE_ENV == "production" ? this.gasPrice[gasType] : 3;
    }

    async transferToken(fromAcnt, toAddr, amount) {
        const from = await this.getAccountByPk(fromAcnt);
        const transferAbi = await this.getTransferAbi(toAddr, amount);
        const transferGasPrice = await this.getTransferGasPrice(
            from.address,
            toAddr,
            amount
        );

        return this.txEmitter.push(this.executeTx(from, transferAbi, transferGasPrice));
    }

    async transferFrom(fromAcnt, toAddr, amount) {
        const from = await this.getAccountByPk(fromAcnt);
        const to = await this.getAccountByPk(toAddr);

        const transferFromAbi = await this.getTransferFromAbi(
            from.address,
            to.address,
            amount
        );
        const transferFromGasPrice = await this.getTransferFromGasPrice(
            from.address,
            to.address,
            amount
        );

        return this.txEmitter.push(this.executeTx(to, transferFromAbi, transferFromGasPrice));
    }

    async executeTx(fromAcnt, encodedAbi, gasPrice) {
        const op = retry.operation({
            retries: 255
        }, );

        return new Promise((resolve, reject) => {
            op.attempt(
                async function(currentAttempt) {
                    await delay(2000);
                    log.info(`Attemps: ${currentAttempt}`);
                    const estimateGasVal = this.getGasPrice("FastGasPrice");
                    if (estimateGasVal > 30) {
                        await delay(2000);
                        log.info(`Gas is expensive : ${estimateGasVal}`);
                        op.retry(true);
                        return;
                    }

                    const signedTx = await this.genGeneralSignTx(
                        fromAcnt,
                        encodedAbi,
                        gasPrice
                    );

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

    async executeTxFeeTxRetry(fromAct, toAct) {
        const op = retry.operation();
        return new Promise((resolve, reject) => {
            op.attempt(async(currentAttempt) => {
                log.info("Execute Tx Transfer FEE");
                await delay(2000);
                const estimatedGas = await this.getApproveGasPrice(fromAct, toAct);

                const calcFee = this.getGasPrice("ProposeGasPrice");
                const calcFastFee = this.getGasPrice("FastGasPrice");
                const calcGasPrice = this.web3.utils.toWei(
                    String(Math.floor(30 * estimatedGas)),
                    "gwei"
                );
                const transferFee = this.web3.utils.toWei(
                    String(Math.floor(parseFloat(calcFastFee))),
                    "gwei"
                );
                log.info(`gasPrice(Gwei): ${calcFee}`);
                log.info(`Calc Gas Price: ${calcGasPrice} wei`);

                const transferTx = await this.web3.eth.accounts.signTransaction({
                        from: fromAct.address,
                        gas: estimatedGas,
                        to: toAct.address,
                        gasPrice: transferFee,
                        value: calcGasPrice,
                    },
                    fromAct.privateKey,
                    false
                );

                const result = await this.web3.eth
                    .sendSignedTransaction(transferTx.rawTransaction)
                    .then((rep) => {
                        log.info("Resolved");
                        resolve(rep.transactionHash);
                    })
                    .catch((error) => {
                        op.retry(error);
                        return;
                    });
            });
        });
    }

    async genLockAbi(toAddress) {
        return await this.srtContract.methods.addToBlacklist(toAddress).encodeABI();
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

    async getTransferFromAbi(fromAddr, toAddr, amount) {
        const amountValue = this.convertAmount(amount);

        return await this.srtContract.methods
            .transferFrom(fromAddr, toAddr, amountValue)
            .encodeABI();
    }

    async getTransferFromGasPrice(fromAddr, toAddr, amount) {
        const amountValue = this.convertAmount(amount);

        return await this.srtContract.methods
            .transferFrom(fromAddr, toAddr, amountValue)
            .estimateGas({ from: toAddr });
    }

    async getTransferGasPrice(fromAddr, toAddr, amount) {
        const amountValue = this.convertAmount(amount);
        log.info(`Amount Point #4 : ${amountValue}`);
        return await this.srtContract.methods
            .transfer(toAddr, amountValue)
            .estimateGas({ from: fromAddr });
    }

    async genSignTx(fromAccount, toAccount, encodeABI) {
        const estimateGasPrice = this.getGasPrice("ProposeGasPrice");
        const estimateGas = await this.getApproveGasPrice(fromAccount, toAccount);
        const calcGasPrice = this.web3.utils.toWei(
            String(Math.floor(parseFloat(estimateGasPrice))),
            "gwei"
        );

        return await this.web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: fromAccount.address,
                gas: estimateGas,
                gasPrice: calcGasPrice,
                to: this.tokenAddress,
            },
            fromAccount.privateKey,
            false
        );
    }

    async genGeneralSignTx(fromAccount, encodeABI, gasPrice) {
        let estimateGasPrice = this.getGasPrice("FastGasPrice");
        // estimateGasPrice = estimateGasPrice > 45 ? 45 : estimateGasPrice;

        // const calcGasPrice = this.web3.utils.toWei(
        //     String(Math.floor(parseFloat(estimateGasPrice))),
        //     "gwei"
        // );

        const calcGasPrice = this.web3.utils.toWei(
            // TEmp
            String(Math.floor(30)),
            "gwei"
        );

        const nonceVal = await this.web3.eth.getTransactionCount(
            fromAccount.address,
            "pending"
            // "latest"
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

    async lockWallet(ownerAct, toAddress) {
        const encodedAbi = await this.genLockAbi(toAddress);
        const gasPrice = await this.genLockGasPrice(ownerAct, toAddress);
        return await this.executeTx(ownerAct, encodedAbi, gasPrice);
    }

    async lockWallets(ownerAct, toAddresses) {
        const encodedAbi = await this.genLockWallesAbi(toAddresses);
        const gasPrice = await this.genLockWalletsGasPrice(ownerAct, toAddresses);
        return this.executeTx(ownerAct, encodedAbi, gasPrice);
    }

    async sendTxWithRetry(fromAct, encodeABI, gasPrice) {
            const op = retry.operation();
            return new Promise((resolve, reject) => {
                op.attempt(async(currentAttempt) => {
                    await delay(2000);
                    const signedTx = await this.genGeneralSignTx(
                        fromAct,
                        encodeABI,
                        gasPrice
                    );
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
        /**
         * Create a ethereum wallet from the mnemonic words
         * @param {*} mnemonic - the mnemonic words
         * TODO: add derivation index from DB
         */
    async mnemonicToWallet(mnemonic) {
            log.info("mnemonic" + mnemonic);
            const seed = await MnemonicService.mnemonicToSeed(mnemonic);

            // Ethereum não diferencia endereços testnet e mainnet
            const path = "m/44'/60'/0'/0/0";

            const ethKey = hdkey.fromMasterSeed(seed);
            const wallet = ethKey.derivePath(path).getWallet();
            return wallet;
        }
        /**
         * Derive a ethereum address from a mnemonic
         * @param {*} mnemonic - the mnemonic words
         */

    async newWallet(mnemonic) {
        const wallet = await this.mnemonicToWallet(mnemonic);
        //    let ethereumAddress = Wallet.getAddress().toString('hex');
        return wallet;
    }

    getSRTPriceByMXC() {
        return this.srtPrice;
    }

    addHexPrefix(rawStr) {
        return EthereumUtil.addHexPrefix(rawStr);
    }

    generateMnemonic() {
        return MnemonicService.generateMnemonic();
    }

    convertAmount(amount) {
        const decimalBN = this.web3.utils.toBN(this.DECIMAL);
        const amountBN = this.web3.utils.toBN(amount);

        return amountBN.mul(this.web3.utils.toBN(10).pow(decimalBN));
    }
}

module.exports = AdminService;