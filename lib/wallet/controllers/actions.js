/* jshint -W079 */
const Promise = require("bluebird"),
    config = require("config"),
    log = require("metalogger")(),
    representor = require("kokua"),
    axios = require("axios"),
    _ = require("lodash");

const AdminService = require("wallet/services/adminService");

const actions = {},
    adminService = new AdminService();

const responseMediaType = "application/hal+json";

const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const Wallet = require("ethereumjs-wallet").default;
const { hdkey } = require("ethereumjs-wallet");
const MnemonicService = require("./mnemonic");
const EthereumUtil = require("ethereumjs-util");
const srtAbi = require("./srtAbi");
const db = require("datastore");
const socket = require("./socket");
const { logLevelAllowed } = require("metalogger");

const DECIMAL = 18;
const tokenAddress = "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91";

const web3 = createAlchemyWeb3(
    "https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ"
);


actions.create_account = async function(req, res, next) {
    const seed = MnemonicService.generateMnemonic();
    const wallet = await newWallet(seed);

    let addr = wallet.getAddress().toString("hex");
    addr = EthereumUtil.addHexPrefix(addr);
    let pk = wallet.getPrivateKeyString();
    pk = EthereumUtil.addHexPrefix(pk);

    const response = {
        seed: seed,
        addr: addr,
        pk: pk,
    };

    response.req = req.body;

    res.status(200).json(response);
};

actions.empty = async function(req, res, next) {
    const response = { status: "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.fromToWalletValidator = async function(req, res, next) {
    const response = { status: "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.balanceof = async function(req, res, next) {
    const web3 = createAlchemyWeb3(
        "https://eth-mainnet.alchemyapi.io/v2/0k8gsLeB_9tGpG9Bh3-fnQAdea0IUYgQ"
    );
    const srtContract = new web3.eth.Contract(
        srtAbi,
        "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91"
    );

    const balance = await srtContract.methods.balanceOf(req.query.addr).call();
    log.info(balance);
    const response = { balance: balance };
    response.req = req.body;
    res.status(200).json(response);
};

actions.isBlackList = async function(req, res, next) {
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    const addrList = JSON.parse(req.body.addr);
    for (const addr in addrList) {
        const isLocked = await srtContract.methods.blacklist(addrList[addr]).call();
        const balance = await srtContract.methods.balanceOf(addrList[addr]).call();
        const msg = genLockMessage(isLocked, addrList[addr], balance, "-", "Ready");

        req.app.get("io").emit("LockTxStateChanged", msg);
    }

    const response = { status: "ok" };
    res.status(200).json(response);
};

actions.CheckLocked = async function(req, res, next) {
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    const addr = req.query.addr;

    const isLocked = await srtContract.methods.blacklist(addr).call();
    const balance = await srtContract.methods.balanceOf(addr).call();

    const response = { status: "ok" };
    response.Locked = isLocked;
    response.Address = addr;
    response.balance = balance;
    res.status(200).json(response);
};

actions.lockWalletList = async function(req, res, next) {
    const pk = req.body.pk;
    const toAddrs = JSON.parse(req.body.toAddr);
    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    log.info(toAddrs);

    const encodeABI = await srtContract.methods
        .addManyToBlacklist(toAddrs)
        .encodeABI();

    log.info("estimate FEE");
    const estimatedGas = await srtContract.methods
        .addManyToBlacklist(toAddrs)
        .estimateGas({ from: account.address });
    log.info(estimatedGas);

    const signedTx = await web3.eth.accounts.signTransaction({
            data: encodeABI,
            from: account.address,
            gas: estimatedGas,
            to: tokenAddress,
        },
        account.privateKey,
        false
    );

    const result = await web3.eth
        .sendSignedTransaction(signedTx.rawTransaction)
        .on("transactionHash", (txHash) => {
            for (const addrIdx in toAddrs) {
                const msg = genLockMessage(false, toAddrs[addrIdx], -1, txHash, "Pending");
                req.app.get("io").emit("LockTxStateChanged", msg);
            }

            return;
        })
        .on("receipt", (receipt) => {
            log.info(receipt);
            if (receipt.status === false) {
                for (const addrIdx in toAddrs) {
                    const msg = genLockMessage(false, toAddrs[addrIdx], -1, receipt.transactionHash, "Reverted");
                    req.app.get("io").emit("LockTxStateChanged", msg);
                }

                return;
            }
            for (const addrIdx in toAddrs) {
                const msg = genLockMessage(false, toAddrs[addrIdx], -1, receipt.transactionHash, "Done");
                req.app.get("io").emit("LockTxStateChanged", msg);
            }

            return;
        })
        .catch((error) => {
            log.info(error);
            for (const addrIdx in toAddrs) {
                const msg = genLockMessage(false, toAddrs[addrIdx], -1, "-", "Retry");
                req.app.get("io").emit("LockTxStateChanged", msg);
            }

            return;
        });
    const response = { status: "ok" };
    res.status(200).json(response);
};

actions.approveByTransferFee = async function(req, res, next) {
    const toPk = req.body.toPk;
    const fromPk = req.body.fromPk;

    const ownerAccount = await web3.eth.accounts.privateKeyToAccount(toPk);
    const account = await web3.eth.accounts.privateKeyToAccount(fromPk);
    const balance = await adminService.getBalance(account.address);

    const isNotAllowance = await adminService.isNotAllowance(account, ownerAccount);

    if (isNotAllowance) {
        log.info(`is not Allowange : ${account.address}, balance ${balance} `);
        req.app.get("io").emit("AppTxStateChanged", genSocketMsg("ApproveStart", "-", account.address, account.privateKey, 0, 0));

        const tranferReceipt = await adminService.transferFee(ownerAccount, account)
            .catch((error) => {
                log.error(error);
                const msg = genSocketMsg("Transfer Fee Failed", "-", account.address, account.privateKey, 0, 0);
                req.app.get("io").emit("AppTxStateChanged", msg);
                const response = { status: "failed" };
                res.status(500).json(response);
                return;
            });
        req.app.get("io").emit("AppTxStateChanged", genSocketMsg("Transfer Fee Done", tranferReceipt.transactionHash, account.address, account.privateKey, 0, 0));

        const resReceipt = await adminService.approve(account, ownerAccount)
            .catch((error) => {
                log.error(error);
                const msg = genSocketMsg("Approve Failed", "-", account.address, account.privateKey, 0, 0);
                req.app.get("io").emit("AppTxStateChanged", msg);
                const response = { status: "failed" };
                res.status(500).json(response);
                return;
            });
        req.app.get("io").emit("AppTxStateChanged", genSocketMsg("Approve Done", resReceipt.transactionHash, account.address, account.privateKey, 0, 0));

    } else {
        const msg = genSocketMsg("Approve Done", "-", account.address, account.privateKey, balance, 0);
        req.app.get("io").emit("AppTxStateChanged", msg);
    }

    const response = { "status": "ok", "addr": account.address, "balance": balance };
    res.status(200).json(response);
};


actions.onlyApprove = async function(req, res, next) {
    const fromPk = req.body.fromPk;
    const toPk = req.body.toPk;

    const ownerAccount = await web3.eth.accounts.privateKeyToAccount(toPk);
    const account = await web3.eth.accounts.privateKeyToAccount(fromPk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    const isAllowance = await srtContract.methods
        .allowance(account.address, ownerAccount.address)
        .call();
    if (isAllowance == 0) {
        const approveMaxValue = web3.utils.toBN("15000000000000000000000000000");
        const encodeABI = await srtContract.methods
            .approve(ownerAccount.address, approveMaxValue)
            .encodeABI();
        const estimatedGas = await srtContract.methods
            .approve(ownerAccount.address, approveMaxValue)
            .estimateGas();

        log.error("estimateGas : " + estimatedGas);
        log.error("From Addr : " + ownerAccount.address);
        log.error("toAddr : " + account.address);

        const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
        const baseFee = feeRes.data.result["ProposeGasPrice"];
        const modifiedGasPrice = web3.utils.toWei(String(Math.floor(parseFloat(baseFee))), 'gwei');

        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas,
                gasPrice: modifiedGasPrice,
                to: tokenAddress
            },
            account.privateKey,
            false
        );

        log.error("signedTx : " + signedTx);

        web3.eth
            .sendSignedTransaction(signedTx.rawTransaction)
            .once("transactionHash", (txHash) => {
                const msg = genSocketMsg("Pending", txHash, account.address, account.privateKey, 0, 0);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .once("receipt", (receipt) => {
                log.info(receipt);
                const toAddr = account.address;

                if (receipt.status === false) {
                    const msg = genSocketMsg("Reverted", receipt.transactionHash, account.address, account.privateKey, 0, 5);
                    req.app.get("io").emit("TxStateChanged", msg);
                    return;
                }
                const msg = genSocketMsg("Approve Done", receipt.transactionHash, account.address, account.privateKey, 0, 4);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .catch((error) => {
                log.info(error);
                const msg = genSocketMsg("Approve Retry", "-", account.address, account.privateKey, 0, 3);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            });
        return;
    }

    const balance = await srtContract.methods
        .balanceOf(account.address)
        .call();

    const response = { "status": "ok", "addr": account.address, "balance": balance };
    res.status(200).json(response);
};

actions.lock = async function(req, res, next) {
    const pk = req.body.pk;
    const address = req.body.toAddr;
    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    const balance = await srtContract.methods.balanceOf(address).call();

    const encodeABI = await srtContract.methods
        .addToBlacklist(address)
        .encodeABI();

    log.info("estimate FEE");
    const estimatedGas = await srtContract.methods
        .addToBlacklist(address)
        .estimateGas({ from: account.address });
    const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
    const baseFee = feeRes.data.result["ProposeGasPrice"];
    const modifiedGasPrice = web3.utils.toWei(String(Math.floor(parseFloat(baseFee))), 'gwei');
    const signedTx = await web3.eth.accounts.signTransaction({
            data: encodeABI,
            from: account.address,
            gas: estimatedGas,
            gasPrice: modifiedGasPrice,
            to: tokenAddress,
        },
        account.privateKey,
        false
    );

    web3.eth
        .sendSignedTransaction(signedTx.rawTransaction)
        .once("transactionHash", (txHash) => {
            const msg = genLockMessage(false, address, balance, txHash, "Pending");
            req.app.get("io").emit("LockTxStateChanged", msg);
            return;
        })
        .once("receipt", (receipt) => {
            log.info(receipt);
            if (receipt.status === false) {
                const msg = genLockMessage(false, address, balance, receipt.transactionHash, "Reverted");
                req.app.get("io").emit("LockTxStateChanged", msg);
                return;
            }
            const msg = genLockMessage(false, address, balance, receipt.transactionHash, "Done");
            log.info(msg);
            req.app.get("io").emit("LockTxStateChanged", msg);
            return;
        })
        .catch((error) => {
            log.info(error);
            const msg = genLockMessage(false, address, balance, "-", "Retry");
            req.app.get("io").emit("LockTxStateChanged", msg);
            return;
        });

    const response = { status: "ok" };
    res.status(200).json(response);
};

actions.unlock = async function(req, res, next) {
    const response = { status: "ok" };
    response.req = req.body;
    res.status(200).json(response);
};

actions.retryLock = async function(req, res, next) {
    const pk = req.body.pk;
    const address = req.body.toAddr;
    const ownerAct = await web3.eth.accounts.privateKeyToAccount(pk);

    const isLocked = await adminService.isLocked(address);
    if (isLocked) {
        const response = { status: "AlreadyLocked" };
        res.status(200).json(response);
        return;
    }

    const result = adminService.lockWallet(ownerAct, address);

    const response = { status: "ok" };
    response.txHash = result;
    res.status(200).json(response);
};

actions.retryManyLock = async function(req, res, next) {
    const pk = req.body.pk;
    const toAddrs = JSON.parse(req.body.toAddr);

    const ownerAct = await web3.eth.accounts.privateKeyToAccount(pk);

    const result = adminService.lockWallets(ownerAct, toAddrs);

    const response = { status: "ok" };
    response.txHash = result;
    res.status(200).json(response);
};

actions.transfer = async function(req, res, next) {
    const pk = req.body.pk;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;

    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    try {
        const decimalBN = web3.utils.toBN(DECIMAL);
        const amountBN = web3.utils.toBN(amount);

        const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

        const encodeABI = await srtContract.methods
            .transfer(toAddr, amountValue)
            .encodeABI();
        log.info(encodeABI);

        log.info("estimate FEE");
        const estimatedGas = await srtContract.methods
            .transfer(toAddr, amountValue)
            .estimateGas({ from: account.address });
        log.info(estimatedGas);

        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas * 2 < 5000000 ? estimatedGas * 2 : 5000000,
                to: tokenAddress,
            },
            account.privateKey,
            false
        );

        const result = await web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
        );

        const balance = await srtContract.methods.balanceOf(req.query.addr).call();

        const response = { result: result, balance: balance };
        response.req = req.body;
        res.status(200).json(response);
    } catch (error) {
        log.info("Error");
        log.info(error);
        const response = { result: false };
        response.req = req.body;
        res.status(200).json(response);
    }
};

actions.transferFrom = async function(req, res, next) {
    const pk = req.body.pk;
    const fromAddr = req.body.fromAddr;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;

    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);
    const decimalBN = web3.utils.toBN(DECIMAL);
    const amountBN = web3.utils.toBN(amount);
    const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

    log.info("======================================");
    log.info("PK       :" + pk);
    log.info("fromAddr :" + fromAddr);
    log.info("toAddr   :" + toAddr);
    log.info("Owner    :" + account.address);
    log.info("amount   :" + amountValue.toString());
    log.info("======================================");

    const encodeABI = await srtContract.methods
        .transferFrom(fromAddr, toAddr, amountValue)
        .encodeABI();

    log.info("===================1==================");
    const estimatedGas = await srtContract.methods
        .transferFrom(fromAddr, toAddr, amountValue)
        .estimateGas({ from: account.address });

    log.info("===================2==================");

    const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
    const baseFee = feeRes.data.result["ProposeGasPrice"];
    const modifiedGasPrice = web3.utils.toWei(String(Math.floor(parseFloat(baseFee) * 1.2)), 'gwei');

    log.info("===================2==================");
    log.info("estimateGas : " + modifiedGasPrice);

    const signedTx = await web3.eth.accounts.signTransaction({
            data: encodeABI,
            from: account.address,
            gas: estimatedGas,
            gasPrice: modifiedGasPrice,
            to: tokenAddress,
        },
        account.privateKey,
        false
    );

    try {

        log.info("Tx Start");
        web3.eth
            .sendSignedTransaction(signedTx.rawTransaction)
            .once("transactionHash", (txHash) => {
                const toAddr = req.body.toAddr;
                const msg = "Pending:" + txHash + ":" + toAddr + ":0";
                log.info(msg);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .once("receipt", (receipt) => {
                log.info(receipt);
                const toAddr = req.body.toAddr;

                if (receipt.status === false) {
                    const msg =
                        "Reverted:" + receipt.transactionHash + ":" + toAddr + ":1";
                    req.app.get("io").emit("TxStateChanged", msg);
                    return;
                }

                const msg = "Done:" + receipt.transactionHash + ":" + toAddr + ":0";
                log.info(msg);

                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .catch((error) => {
                log.info(error);
                const msg = "Retry:" + "-" + ":" + toAddr + ":2";
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            });
        const response = { status: "ok" };
        res.status(200).json(response);
    } catch (error) {
        log.info("Error");
        log.info(error);
        log.info((new Error()).stack);

        const response = {
            result: false,
            status: "UnknownError",
        };
        response.req = req.body;
        res.status(200).json(response);
    }
    // try {
    //     const estimatedGas = await srtContract.methods
    //         .transferFrom(fromAddr, toAddr, amountValue)
    //         .estimateGas();
    //     log.info(estimatedGas);
    // } catch (error) {
    //     log.info("Error");
    //     log.info(error);
    //     const response = { result: false };
    //     response.req = req.body;
    //     res.status(200).json(response);
    // }

    // const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
    // const baseFee = feeRes.data.result["suggestBaseFee"];

    // const signedTx = await web3.eth.accounts.signTransaction({
    //         data: encodeABI,
    //         from: account.address,
    //         gas: web3.utils.toWei(String(Math.floor(parseFloat(baseFee) * estimatedGas) * 1.1), 'gwei'),
    //         to: tokenAddress,
    //     },
    //     account.privateKey,
    //     false
    // );
    // try {

    //     const result = await web3.eth.sendSignedTransaction(
    //         signedTx.rawTransaction
    //     );

    //     const response = { result: result };
    //     response.req = req.body;
    //     res.status(200).json(response);
    // } catch (error) {
    //     log.info("Error");
    //     log.info(error);
    //     const response = { result: false };
    //     response.req = req.body;
    //     res.status(200).json(response);
    // }
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
    log.info("mnemonic" + mnemonic);
    const seed = await MnemonicService.mnemonicToSeed(mnemonic);

    // Ethereum não diferencia endereços testnet e mainnet
    const path = "m/44'/60'/0'/0/0";

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

    const conn = await db.conn();

    const dupQurey = { name: nameVal, phoneNum: phoneNumVal };
    const duplicateValue = await conn.query(
        "SELECT count(*) FROM batchTransfer WHERE name = ? and phoneNum = ? and sendStatus = ?", [dupQurey.name, dupQurey.phoneNum, "SendSuccess"]
    );

    log.info("======================================");
    log.info("PK :" + pk);
    log.info("toAddr :" + toAddr);
    log.info("amount :" + amount);
    log.info("nameVal :" + nameVal);
    log.info("phoneNumVal :" + phoneNumVal);
    log.info("======================================");

    const account = await web3.eth.accounts.privateKeyToAccount(pk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    try {
        const decimalBN = web3.utils.toBN(DECIMAL);
        const amountBN = web3.utils.toBN(amount);

        const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

        const encodeABI = await srtContract.methods
            .transfer(toAddr, amountValue)
            .encodeABI();

        let estimatedGas = await srtContract.methods
            .transfer(toAddr, amountValue)
            .estimateGas({ from: account.address });
        // let gasPrice = web3.eth.getGasPrice();
        // let gasPriceMore = gasPrice.mul(web3.utils.toBN(1.1));

        estimatedGas = estimatedGas * 2 < 5000000 ? estimatedGas * 2 : 5000000;
        const nonceVal = await web3.eth.getTransactionCount(
            account.address,
            "latest"
        ); // nonce starts counting from 0

        // log.info("Estimate Gas Price : " + gasPriceMore.toNumber());
        log.info("Estimate Gas Value : " + estimatedGas);

        const signedTx = await web3.eth.accounts.signTransaction({
                data: encodeABI,
                from: account.address,
                gas: estimatedGas,
                // gasPrice: gasPriceMore.numberToHex(),
                to: tokenAddress,
                nonce: nonceVal,
            },
            account.privateKey,
            false
        );

        log.info("Tx Start");
        web3.eth
            .sendSignedTransaction(signedTx.rawTransaction)
            .once("transactionHash", (txHash) => {
                const toAddr = req.body.toAddr;
                const msg = "Pending:" + txHash + ":" + toAddr + ":0";
                log.info(msg);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .once("receipt", (receipt) => {
                log.info(receipt);
                const toAddr = req.body.toAddr;

                if (receipt.status === false) {
                    const msg =
                        "Reverted:" + receipt.transactionHash + ":" + toAddr + ":1";
                    req.app.get("io").emit("TxStateChanged", msg);
                    return;
                }

                const msg = "Done:" + receipt.transactionHash + ":" + toAddr + ":0";
                log.info(msg);

                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .catch((error) => {
                log.info(error);
                const msg = "Retry:" + "-" + ":" + toAddr + ":2";
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            });

        const isLocked = await adminService.isLocked(toAddr);
        if (!isLocked) {
            await adminService.lockWallet(account, toAddr);
        }

        const response = { status: "ok" };
        res.status(200).json(response);
    } catch (error) {
        log.info("Error");
        log.info(error);

        const response = {
            result: false,
            status: "UnknownError",
            user: { name: nameVal, phoneNum: phoneNumVal },
        };
        response.req = req.body;
        res.status(200).json(response);
    }
};

actions.test = async function(req, res, next) {
    req.app.get("io").emit("testRecv", req.body.value);
    const response = { status: "ok" };
    log.info(req.body.value);
    res.status(200).json(response);
};


actions.transferFromByPk = async function(req, res, next) {
    const fromPk = req.body.fromPk;
    const toPk = req.body.toPk;

    log.info("======================================");
    log.info("fromPk :" + fromPk);
    log.info("toPk   :" + toPk);
    log.info("======================================");

    const fromAccount = await web3.eth.accounts.privateKeyToAccount(fromPk);
    const toAccount = await web3.eth.accounts.privateKeyToAccount(toPk);
    const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

    const targetBalance = await srtContract.methods.balanceOf(fromAccount.address).call();

    log.info("======================================");
    log.info("fromAddr :" + fromAccount.address);
    log.info("toAddr   :" + toAccount.address);
    log.info("amount   :" + targetBalance.toString());
    log.info("======================================");

    if (targetBalance == 0) {
        const msg = genSocketMsg("Revert Complete", "-", fromAccount.address, fromAccount.privateKey, targetBalance, 0);
        req.app.get("io").emit("TxStateChanged", msg);

        const response = { status: "ok" };
        res.status(200).json(response);
        return;
    }

    // Check Allowance 
    const isAllow = await srtContract.methods.allowance(fromAccount.address, toAccount.address).call();

    if (isAllow == 0) {
        const msg = genSocketMsg("Try Approve", "-", fromAccount.address, fromAccount.privateKey, targetBalance, 0);
        req.app.get("io").emit("TxStateChanged", msg);
        const response = { status: "ok" };

        res.status(200).json(response);
        return;
    }

    const encodeABI = await srtContract.methods
        .transferFrom(fromAccount.address, toAccount.address, targetBalance)
        .encodeABI();

    const estimatedGas = await srtContract.methods
        .transferFrom(fromAccount.address, toAccount.address, targetBalance)
        .estimateGas({ from: toAccount.address });

    const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
    const baseFee = feeRes.data.result["ProposeGasPrice"];
    const modifiedGasPrice = web3.utils.toWei(String(Math.floor(parseFloat(baseFee) * 1.2)), 'gwei');
    log.info("estimateGas : " + modifiedGasPrice);

    const signedTx = await web3.eth.accounts.signTransaction({
            data: encodeABI,
            from: toAccount.address,
            gas: estimatedGas,
            gasPrice: modifiedGasPrice,
            to: tokenAddress,
        },
        toAccount.privateKey,
        false
    );

    try {
        log.info("Tx Start");
        web3.eth
            .sendSignedTransaction(signedTx.rawTransaction)
            .once("transactionHash", (txHash) => {
                const msg = genSocketMsg("Pending", txHash, fromAccount.address, fromAccount.privateKey, targetBalance, 0);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .once("receipt", (receipt) => {
                const fromAddr = fromAccount.address;
                if (receipt.status === false) {
                    const msg = genSocketMsg("Reverted", receipt.transactionHash, fromAccount.address, fromAccount.privateKey, targetBalance, 0);
                    req.app.get("io").emit("TxStateChanged", msg);
                    return;
                }
                const msg = genSocketMsg("Revert Done", receipt.transactionHash, fromAccount.address, fromAccount.privateKey, targetBalance, 0);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            })
            .catch((error) => {
                log.info(error);
                const msg = genSocketMsg("Retry TransferFrom", "-", fromAccount.address, fromAccount.privateKey, targetBalance, 2);
                req.app.get("io").emit("TxStateChanged", msg);
                return;
            });
        const response = { status: "ok" };
        res.status(200).json(response);
    } catch (error) {
        log.info("Error");
        log.info(error);
        log.info((new Error()).stack);

        const response = {
            result: false,
            status: "UnknownError",
        };
        response.req = req.body;
        res.status(200).json(response);
    }
};

actions.transferAndLockAndApprove = async function(req, res, next) {
    const pk = req.body.pk;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;
    const nameVal = req.body.name;
    const phoneNumVal = req.body.phoneNum;

    log.info("======================================");
    log.info("PK :" + pk);
    log.info("toAddr :" + toAddr);
    log.info("amount :" + amount);
    log.info("nameVal :" + nameVal);
    log.info("phoneNumVal :" + phoneNumVal);
    log.info("======================================");

    const ownerAcnt = await web3.eth.accounts.privateKeyToAccount(pk);

    req.app.get("io").emit("TxStateChanged", genSocketMsg("Transfer Start", "-", toAddr, "", amount, 0));
    adminService.transferToken(ownerAcnt, toAddr, amount)
        .then((rep) => {
            req.app.get("io").emit("TxStateChanged", genSocketMsg("Transfer Done", rep.transactionHash, toAddr, "", amount, 0));

        })
        .catch(() => {
            req.app.get("io").emit("TxStateChanged", genSocketMsg("Retry to Transfer", "-", toAddr, "", amount, 2));
            return;
        });

    const isLocked = await adminService.isLocked(toAddr);
    if (!isLocked) {
        req.app.get("io").emit("TxStateChanged", genSocketMsg("Lock Start", "-", toAddr, "", amount, 0));
        const lockedResult = await adminService.lockWallet(ownerAcnt, toAddr);
        req.app.get("io").emit("TxStateChanged", genSocketMsg("Lock Done", lockedResult.transactionHash, toAddr, "", amount, 0));
    }

    const response = { status: "ok" };
    res.status(200).json(response);
};

function genSocketMsg(status, txHash, addr, pk, balance, result) {
    const msg = `${status}:${txHash}:${addr}:${pk}:${balance.toString()}:${result.toString()}`;
    log.info(msg);
    return msg;
}

function genLockMessage(isLocked, address, balance, txHash, status) {
    if (isLocked) {
        return JSON.stringify({ status: "Locked", address: address, balance: balance, txHash: txHash });
    } else if (balance === 0 || balance.toString() === "0") {
        return JSON.stringify({ status: "Empty", address: address, balance: balance, txHash: txHash });
    } else {
        return JSON.stringify({ status: status, address: address, balance: balance, txHash: txHash });
    }
}


module.exports = actions;