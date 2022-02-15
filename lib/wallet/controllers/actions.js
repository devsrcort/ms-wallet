/* jshint -W079 */
const Promise = require('bluebird'),
    config = require('config'),
    log = require('metalogger')(),
    representor = require('kokua'),
    _ = require('lodash');

const actions = {};

const responseMediaType = 'application/hal+json';

const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const Wallet = require('ethereumjs-wallet').default;
const { hdkey } = require('ethereumjs-wallet');
const MnemonicService = require('./mnemonic');
const EthereumUtil = require('ethereumjs-util');
const srtAbi = require('./srtAbi');
const db = require("datastore");

const DECIMAL = 18;
const tokenAddress = "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91";


actions.create_account = async function(req, res, next) {

    const seed = MnemonicService.generateMnemonic();
    const wallet = await newWallet(seed);

    let addr = wallet.getAddress().toString('hex');
    addr = EthereumUtil.addHexPrefix(addr);
    let pk = wallet.getPrivateKeyString();
    pk = EthereumUtil.addHexPrefix(pk);

    const response = {
        "seed": seed,
        "addr": addr,
        "pk": pk
    };

    response.req = req.body;

    res.status(200).json(response);
};

actions.empty = async function(req, res, next) {


    const response = { "status": "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.fromToWalletValidator = async function(req, res, next) {

    const response = { "status": "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.balanceof = async function(req, res, next) {


    const web3 = createAlchemyWeb3("https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ");
    const srtContract = new web3.eth.Contract(srtAbi, "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91");

    const balance = await srtContract.methods.balanceOf(req.query.addr).call();
    console.log(balance);
    const response = { "balance": balance };
    response.req = req.body;
    res.status(200).json(response);
};

actions.approve = async function(req, res, next) {

    const web3 = createAlchemyWeb3("https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ");
    const account = await web3.eth.accounts.privateKeyToAccount("0x00");
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    try {
        const approveMaxValue = await srtContract.methods.INITIAL_SUPPLY.call();

        const encodeABI = await srtContract.methods.approve("0xb29082d1E5e2F5ec3D7480200395ac867948E469", approveMaxValue).encodeABI();
        const estimatedGas = await srtContract.methods.approve("0xb29082d1E5e2F5ec3D7480200395ac867948E469", approveMaxValue).estimateGas();
        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas,
                to: tokenAddress,
            },
            account.privateKey,
            false
        );

        console.log(estimatedGas);
        console.log(encodeABI);

        const result = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const response = { "result": result };
        response.req = req.body;
        res.status(200).json(response);
    } catch (error) {
        console.log("Error");
        console.log(error);
        const response = { "result": false };
        response.req = req.body;
        res.status(200).json(response);
    }

};

actions.lock = async function(req, res, next) {

    const response = { "status": "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.unlock = async function(req, res, next) {

    const response = { "status": "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.transfer = async function(req, res, next) {

    const pk = req.body.pk;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;

    const web3 = createAlchemyWeb3("https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ");
    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    try {
        const decimalBN = web3.utils.toBN(DECIMAL);
        const amountBN = web3.utils.toBN(amount);

        const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

        const encodeABI = await srtContract.methods.transfer(toAddr, amountValue).encodeABI();
        console.log(encodeABI);

        console.log('estimate FEE');
        const estimatedGas = await srtContract.methods.transfer(toAddr, amountValue).estimateGas({ from: account.address });
        console.log(estimatedGas);

        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas * 2 < 5000000 ? estimatedGas * 2 : 5000000,
                to: tokenAddress,
            },
            account.privateKey,
            false
        );

        const result = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const balance = await srtContract.methods.balanceOf(req.query.addr).call();

        const response = { "result": result, "balance": balance };
        response.req = req.body;
        res.status(200).json(response);
    } catch (error) {
        console.log("Error");
        console.log(error);
        const response = { "result": false };
        response.req = req.body;
        res.status(200).json(response);
    }

};


actions.transferFrom = async function(req, res, next) {

    const pk = req.body.pk;
    const fromAddr = req.body.fromAddr;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;

    const web3 = createAlchemyWeb3("https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ");
    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    try {
        const decimalBN = web3.utils.toBN(DECIMAL);
        const amountBN = web3.utils.toBN(amount);
        const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

        const encodeABI = await srtContract.methods.transferFrom(fromAddr, toAddr, amountValue).encodeABI();

        console.log("estimate FEE");
        const estimatedGas = await srtContract.methods.transferFrom(fromAddr, toAddr, amountValue).estimateGas({ from: toAddr });
        console.log(estimatedGas);

        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas * 2 < 5000000 ? estimatedGas * 2 : 5000000,
                to: tokenAddress,
            },
            account.privateKey,
            false
        );

        const result = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        const response = { "result": result };
        response.req = req.body;
        res.status(200).json(response);
    } catch (error) {
        console.log("Error");
        console.log(error);
        const response = { "result": false };
        response.req = req.body;
        res.status(200).json(response);
    }

};


/**
 * Derive a ethereum address from a mnemonic
 * @param {*} mnemonic - the mnemonic words
 */
async function newWallet(mnemonic) {
    const wallet = await mnemonicToWallet(mnemonic);
    //    let ethereumAddress = Wallet.getAddress().toString('hex');
    return wallet;
}

/**
 * Create a ethereum wallet from the mnemonic words
 * @param {*} mnemonic - the mnemonic words
 * TODO: add derivation index from DB
 */
async function mnemonicToWallet(mnemonic) {
    console.log('mnemonic' + mnemonic);
    const seed = await MnemonicService.mnemonicToSeed(mnemonic);

    // Ethereum não diferencia endereços testnet e mainnet
    const path = 'm/44\'/60\'/0\'/0/0';

    const ethKey = hdkey.fromMasterSeed(seed);
    const wallet = ethKey.derivePath(path).getWallet();
    return wallet;
}

actions.transferAdmin = async function(req, res, next) {

    const pk = req.body.pk;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;
    const nameVal = req.body.name;
    const phoneNumVal = req.body.phoneNum;
    const emailVal = req.body.email;

    const conn = await db.conn();

    const dupQurey = { name: nameVal, phoneNum: phoneNumVal, email: emailVal };
    const duplicateValue = await conn.query("SELECT count(*) FROM batchTransfer WHERE name = ? and phoneNum = ? and email = ?", [dupQurey.name, dupQurey.phoneNum, dupQurey.email]);

    if (duplicateValue[0]['count(*)'] > 0) {
        const response = { "status": "duplicate", "user": { name: nameVal, phoneNum: phoneNumVal, email: emailVal } };
        response.body = res.body;
        res.status(200).json(response);
        return;
    }

    const web3 = createAlchemyWeb3("https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ");
    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    try {
        const decimalBN = web3.utils.toBN(DECIMAL);
        const amountBN = web3.utils.toBN(amount);

        const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

        const encodeABI = await srtContract.methods.transfer(toAddr, amountValue).encodeABI();

        let estimatedGas = await srtContract.methods.transfer(toAddr, amountValue).estimateGas({ from: account.address });
        estimatedGas = estimatedGas * 2 < 5000000 ? estimatedGas * 2 : 5000000;

        console.log("Estimate Gas Price : " + estimatedGas);

        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas,
                to: tokenAddress,
            },
            account.privateKey,
            false
        );

        const result = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (result.status) {
            const balanceVal = await srtContract.methods.balanceOf(toAddr).call();

            const balanceBN = web3.utils.toBN(balanceVal);
            const balanceValue = balanceBN.div(web3.utils.toBN(10).pow(decimalBN));

            const values = { wallet_address: toAddr, balance: balanceValue.toNumber(), name: nameVal, phoneNum: phoneNumVal, email: emailVal };
            const duplicateValue = await conn.query("INSERT INTO batchTransfer(wallet_address, balance, name, phoneNum, email, userToken, txHash) VALUES(?, ?, ?, ?, ?, ?, ?)", [values.wallet_address, values.balance, values.name, values.phoneNum, values.email, 'admin', result.transactionHash]);

            const response = { "result": true, "status": "Success", "data": result, "balance": balanceValue.toNumber(), "txHash": result.transactionHash };
            response.req = req.body;
            res.status(200).json(response);
        } else {
            const response = { "result": false, "status": "TxError", "data": result, "user": { name: nameVal, phoneNum: phoneNumVal, email: emailVal } };
            response.req = req.body;
            res.status(200).json(response);
        }

    } catch (error) {
        console.log("Error");
        console.log(error);
        const response = { "result": false, "status": "UnknownError" };
        response.req = req.body;
        res.status(200).json(response);
    }

};


module.exports = actions;