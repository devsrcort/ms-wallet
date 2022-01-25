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

actions.create_account = async function(req, res, next) {

    //const response = { "status": "ok" };
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

    const response = { "status": "ok", "balance": 100 };

    // const web3 = createAlchemyWeb3("https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ");
    response.req = req.body;
    res.status(200).json(response);
};

actions.approve = async function(req, res, next) {

    const response = { "status": "ok" };
    response.req = req.body;
    res.status(200).json(response);
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


module.exports = actions;