const log = require("metalogger")();
const Promise = require("bluebird");
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const srtAbi = require("./srtAbi");
const tokenCtrlAbi = require("./tokenCtrlAbi");
const retry = require("retry");
const { delay } = require("bluebird");
const MnemonicService = require("./mnemonic");
const Wallet = require("ethereumjs-wallet").default;
const { hdkey } = require("ethereumjs-wallet");
const EthereumUtil = require("ethereumjs-util");
const TxEmitterService = require("./txEmitterService.js");
const ValueObserver = require("./valueObserver.js");

class AdminService {
    constructor(valueObserver) {
        this.valueObserver = valueObserver;
        this.DECIMAL = 18;
        this.tokenAddress =
            process.env.NODE_ENV == "production" ?
            "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91" :
            "0x19D6872C7Fc65E70a3b715470845918D8917b178";

        this.ctrlAddress = process.env.NODE_ENV == "production" ?
            "0x689A42Ce049da31a4b1Ed10Fe5791b05f1186ac6" :
            "0x5898fdb590CC49bcEFdeEDFA9B089c6eB9176451";

        // const apiUrl = `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_APIKEY}`;
        const apiBase =
            process.env.NODE_ENV == "production" ?
            "https://eth-mainnet.alchemyapi.io/v2/" :
            "https://eth-goerli.alchemyapi.io/v2/";

        const apiUrl = apiBase + process.env.ALCHEMY_APIKEY;

        this.web3 = createAlchemyWeb3(apiUrl);
        this.srtContract = new this.web3.eth.Contract(srtAbi, this.tokenAddress);
        this.approveMaxValue = this.web3.utils.toBN(
            "15000000000000000000000000000"
        );

        this.tokenCtrlContract = new this.web3.eth.Contract(tokenCtrlAbi, this.ctrlAddress);
        this.ctrlOwner = process.env.NODE_ENV == "production" ?
            "0x8d7472EDCd3854434f1f49850a8cc35467e5550E" :
            "0x37176cD3A59f36DFdaa8a07C8277071cAcbBdAa1";

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

    async getTransferWithFeeAbi(fromAddr, toAddr, amount, fee) {
        return await this.tokenCtrlContract.methods
            .transferWithFee(fromAddr, toAddr, amount, fee)
            .encodeABI({ from: this.ctrlOwner });
    }

    async getTransferWithFeeGasPrice(fromAddr, toAddr, amount, fee) {
        return await this.tokenCtrlContract.methods
            .transferWithFee(fromAddr, toAddr, amount, fee)
            .estimateGas({ from: this.ctrlOwner });
    }

    async calcTrasferFee(fromAddr, toAddr, amount, fee) {
        const gasPrice = await this.getTransferWithFeeGasPrice(fromAddr, toAddr, amount, fee);
        const fastGasPrice = this.valueObserver.getGasPrice("FastGasPrice");
        return this.web3.utils.toWei(
            String(Math.floor(fastGasPrice * gasPrice)),
            "gwei"
        );
    }

    async transferToken(fromAcnt, toAddr, amount) {
        const from = await this.getAccountByPk(fromAcnt);
        const transferAbi = await this.getTransferAbi(toAddr, amount);
        const transferGasPrice = await this.getTransferGasPrice(
            from.address,
            toAddr,
            amount
        );

        return this.txEmitter.push(
            this.executeTx(from, transferAbi, transferGasPrice)
        );
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

        return this.txEmitter.push(
            this.executeTx(to, transferFromAbi, transferFromGasPrice)
        );
    }

    async executeTx(fromAcnt, encodedAbi, gasPrice) {
        const op = retry.operation({
            retries: 255,
            factor: 1
        });

        return new Promise((resolve, reject) => {
            op.attempt(
                async function(currentAttempt) {
                    await delay(2000);
                    log.info(`Attemps: ${currentAttempt}`);
                    const estimateGasVal = this.valueObserver.getGasPrice("FastGasPrice");
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

                const calcFee = this.valueObserver.getGasPrice("ProposeGasPrice");
                const calcFastFee = this.valueObserver.getGasPrice("FastGasPrice");
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
        const estimateGasPrice = this.valueObserver.getGasPrice("ProposeGasPrice");
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
        const estimateGasPrice = this.valueObserver.getGasPrice("FastGasPrice");
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

    async getAllowance(_from, _to) {
        return await this.srtContract.methods.allowance(_from, _to).call();
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