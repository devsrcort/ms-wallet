/* jshint -W079 */
const Promise = require("bluebird"),
    config = require("config"),
    log = require("metalogger")(),
    axios = require("axios"),
    representor = require("kokua"),
    _ = require("lodash");

const AdminService = require("wallet/services/adminService");

const actions = {},
    adminService = new AdminService();

const responseMediaType = "application/hal+json";

const socket = require("./socket");
const { logLevelAllowed } = require("metalogger");

actions.create_account = async function(req, res, next) {
    const seed = adminService.generateMnemonic();
    const wallet = await adminService.newWallet(seed);

    let addr = wallet.getAddress().toString("hex");
    addr = adminService.addHexPrefix(addr);
    let pk = wallet.getPrivateKeyString();
    pk = adminService.addHexPrefix(pk);

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
    const balance = await adminService.getBalance(req.query.addr);
    log.info(`Address : ${req.query.addr} :: Balance : ${balance}`);
    const response = { balance: balance };
    response.req = req.body;
    res.status(200).json(response);
};

actions.CheckLocked = async function(req, res, next) {
    const addr = req.query.addr;

    const isLocked = await adminService.isLocked(addr);
    const balance = await adminService.getBalance(addr);

    const response = { status: "ok" };
    response.Locked = isLocked;
    response.Address = addr;
    response.balance = balance;
    res.status(200).json(response);
};

actions.lockWalletList = async function(req, res, next) {
    const pk = req.body.pk;
    const toAddrs = JSON.parse(req.body.toAddr);

    const ownerAcnt = await adminService.getAccountByPk(pk);
    log.info("Locked wallets");

    adminService.lockWallets(ownerAcnt, toAddrs)
        .then((receipt) => {
            log.info(receipt.transactionHash);
            return;
        })
        .catch((error) => {
            log.info(error.message);
            return;
        });

    const response = { status: "ok" };
    res.status(200).json(response);
};

actions.approveByTransferFee = async function(req, res, next) {
    const toPk = req.body.toPk;
    const fromPk = req.body.fromPk;

    const ownerAccount = await adminService.getAccountByPk(toPk);
    const account = await adminService.getAccountByPk(fromPk);
    const balance = await adminService.getBalance(account.address);

    const isNotAllowance = await adminService.isNotAllowance(
        account,
        ownerAccount
    );

    if (isNotAllowance) {
        log.info(`is not Allowange : ${account.address}, balance ${balance} `);
        req.app
            .get("io")
            .emit(
                "AppTxStateChanged",
                genSocketMsg(
                    "ApproveStart",
                    "-",
                    account.address,
                    account.privateKey,
                    0,
                    0
                )
            );

        const tranferReceipt = await adminService
            .transferFee(ownerAccount, account)
            .catch((error) => {
                log.error(error);
                const msg = genSocketMsg(
                    "Transfer Fee Failed",
                    "-",
                    account.address,
                    account.privateKey,
                    0,
                    0
                );
                req.app.get("io").emit("AppTxStateChanged", msg);
                const response = { status: "failed" };
                res.status(500).json(response);
                return;
            });
        req.app
            .get("io")
            .emit(
                "AppTxStateChanged",
                genSocketMsg(
                    "Transfer Fee Done",
                    tranferReceipt.transactionHash,
                    account.address,
                    account.privateKey,
                    0,
                    0
                )
            );

        const resReceipt = await adminService
            .approve(account, ownerAccount)
            .catch((error) => {
                log.error(error);
                const msg = genSocketMsg(
                    "Approve Failed",
                    "-",
                    account.address,
                    account.privateKey,
                    0,
                    0
                );
                req.app.get("io").emit("AppTxStateChanged", msg);
                const response = { status: "failed" };
                res.status(500).json(response);
                return;
            });
        req.app
            .get("io")
            .emit(
                "AppTxStateChanged",
                genSocketMsg(
                    "Approve Done",
                    resReceipt.transactionHash,
                    account.address,
                    account.privateKey,
                    0,
                    0
                )
            );
    } else {
        const msg = genSocketMsg(
            "Approve Done",
            "-",
            account.address,
            account.privateKey,
            balance,
            0
        );
        req.app.get("io").emit("AppTxStateChanged", msg);
    }

    const response = { status: "ok", addr: account.address, balance: balance };
    res.status(200).json(response);
};

actions.onlyApprove = async function(req, res, next) {};
// actions.onlyApprove = async function(req, res, next) {
//     const fromPk = req.body.fromPk;
//     const toPk = req.body.toPk;

//     const ownerAccount = await web3.eth.accounts.privateKeyToAccount(toPk);
//     const account = await web3.eth.accounts.privateKeyToAccount(fromPk);
//     const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

//     const isAllowance = await srtContract.methods
//         .allowance(account.address, ownerAccount.address)
//         .call();
//     if (isAllowance == 0) {
//         const approveMaxValue = web3.utils.toBN("15000000000000000000000000000");
//         const encodeABI = await srtContract.methods
//             .approve(ownerAccount.address, approveMaxValue)
//             .encodeABI();
//         const estimatedGas = await srtContract.methods
//             .approve(ownerAccount.address, approveMaxValue)
//             .estimateGas();

//         log.error("estimateGas : " + estimatedGas);
//         log.error("From Addr : " + ownerAccount.address);
//         log.error("toAddr : " + account.address);

//         const feeRes = await axios.get(
//             "https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U"
//         );
//         const baseFee = feeRes.data.result["ProposeGasPrice"];
//         const modifiedGasPrice = web3.utils.toWei(
//             String(Math.floor(parseFloat(baseFee))),
//             "gwei"
//         );

//         const signedTx = await web3.eth.accounts.signTransaction({
//                 data: encodeABI,
//                 from: account.address,
//                 gas: estimatedGas,
//                 gasPrice: modifiedGasPrice,
//                 to: tokenAddress,
//             },
//             account.privateKey,
//             false
//         );

//         log.error("signedTx : " + signedTx);

//         web3.eth
//             .sendSignedTransaction(signedTx.rawTransaction)
//             .once("transactionHash", (txHash) => {
//                 const msg = genSocketMsg(
//                     "Pending",
//                     txHash,
//                     account.address,
//                     account.privateKey,
//                     0,
//                     0
//                 );
//                 req.app.get("io").emit("TxStateChanged", msg);
//                 return;
//             })
//             .once("receipt", (receipt) => {
//                 log.info(receipt);
//                 const toAddr = account.address;

//                 if (receipt.status === false) {
//                     const msg = genSocketMsg(
//                         "Reverted",
//                         receipt.transactionHash,
//                         account.address,
//                         account.privateKey,
//                         0,
//                         5
//                     );
//                     req.app.get("io").emit("TxStateChanged", msg);
//                     return;
//                 }
//                 const msg = genSocketMsg(
//                     "Approve Done",
//                     receipt.transactionHash,
//                     account.address,
//                     account.privateKey,
//                     0,
//                     4
//                 );
//                 req.app.get("io").emit("TxStateChanged", msg);
//                 return;
//             })
//             .catch((error) => {
//                 log.info(error);
//                 const msg = genSocketMsg(
//                     "Approve Retry",
//                     "-",
//                     account.address,
//                     account.privateKey,
//                     0,
//                     3
//                 );
//                 req.app.get("io").emit("TxStateChanged", msg);
//                 return;
//             });
//         return;
//     }

//     const balance = await srtContract.methods.balanceOf(account.address).call();

//     const response = { status: "ok", addr: account.address, balance: balance };
//     res.status(200).json(response);
// };

actions.transfer = async function(req, res, next) {};
// actions.transfer = async function(req, res, next) {
//     const pk = req.body.pk;
//     const toAddr = req.body.toAddr;
//     const amount = req.body.amount;

//     const account = await web3.eth.accounts.privateKeyToAccount(pk);
//     const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);

//     try {
//         const decimalBN = web3.utils.toBN(DECIMAL);
//         const amountBN = web3.utils.toBN(amount);

//         const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

//         const encodeABI = await srtContract.methods
//             .transfer(toAddr, amountValue)
//             .encodeABI();
//         log.info(encodeABI);

//         log.info("estimate FEE");
//         const estimatedGas = await srtContract.methods
//             .transfer(toAddr, amountValue)
//             .estimateGas({ from: account.address });
//         log.info(estimatedGas);

//         const signedTx = await web3.eth.accounts.signTransaction({
//                 data: encodeABI,
//                 from: account.address,
//                 gas: estimatedGas * 2 < 5000000 ? estimatedGas * 2 : 5000000,
//                 to: tokenAddress,
//             },
//             account.privateKey,
//             false
//         );

//         const result = await web3.eth.sendSignedTransaction(
//             signedTx.rawTransaction
//         );

//         const balance = await srtContract.methods.balanceOf(req.query.addr).call();

//         const response = { result: result, balance: balance };
//         response.req = req.body;
//         res.status(200).json(response);
//     } catch (error) {
//         log.info("Error");
//         log.info(error);
//         const response = { result: false };
//         response.req = req.body;
//         res.status(200).json(response);
//     }
// };

actions.transferFrom = async function(req, res, next) {};
// actions.transferFrom = async function(req, res, next) {
//     const pk = req.body.pk;
//     const fromAddr = req.body.fromAddr;
//     const toAddr = req.body.toAddr;
//     const amount = req.body.amount;

//     const account = await web3.eth.accounts.privateKeyToAccount(pk);
//     const srtContract = new web3.eth.Contract(srtAbi, tokenAddress);
//     const decimalBN = web3.utils.toBN(DECIMAL);
//     const amountBN = web3.utils.toBN(amount);
//     const amountValue = amountBN.mul(web3.utils.toBN(10).pow(decimalBN));

//     log.info("======================================");
//     log.info("PK       :" + pk);
//     log.info("fromAddr :" + fromAddr);
//     log.info("toAddr   :" + toAddr);
//     log.info("Owner    :" + account.address);
//     log.info("amount   :" + amountValue.toString());
//     log.info("======================================");

//     const encodeABI = await srtContract.methods
//         .transferFrom(fromAddr, toAddr, amountValue)
//         .encodeABI();

//     log.info("===================1==================");
//     const estimatedGas = await srtContract.methods
//         .transferFrom(fromAddr, toAddr, amountValue)
//         .estimateGas({ from: account.address });

//     log.info("===================2==================");

//     const feeRes = await axios.get(
//         "https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U"
//     );
//     const baseFee = feeRes.data.result["ProposeGasPrice"];
//     const modifiedGasPrice = web3.utils.toWei(
//         String(Math.floor(parseFloat(baseFee) * 1.2)),
//         "gwei"
//     );

//     log.info("===================2==================");
//     log.info("estimateGas : " + modifiedGasPrice);

//     const signedTx = await web3.eth.accounts.signTransaction({
//             data: encodeABI,
//             from: account.address,
//             gas: estimatedGas,
//             gasPrice: modifiedGasPrice,
//             to: tokenAddress,
//         },
//         account.privateKey,
//         false
//     );

//     try {
//         log.info("Tx Start");
//         web3.eth
//             .sendSignedTransaction(signedTx.rawTransaction)
//             .once("transactionHash", (txHash) => {
//                 const toAddr = req.body.toAddr;
//                 const msg = "Pending:" + txHash + ":" + toAddr + ":0";
//                 log.info(msg);
//                 req.app.get("io").emit("TxStateChanged", msg);
//                 return;
//             })
//             .once("receipt", (receipt) => {
//                 log.info(receipt);
//                 const toAddr = req.body.toAddr;

//                 if (receipt.status === false) {
//                     const msg =
//                         "Reverted:" + receipt.transactionHash + ":" + toAddr + ":1";
//                     req.app.get("io").emit("TxStateChanged", msg);
//                     return;
//                 }

//                 const msg = "Done:" + receipt.transactionHash + ":" + toAddr + ":0";
//                 log.info(msg);

//                 req.app.get("io").emit("TxStateChanged", msg);
//                 return;
//             })
//             .catch((error) => {
//                 log.info(error);
//                 const msg = "Retry:" + "-" + ":" + toAddr + ":2";
//                 req.app.get("io").emit("TxStateChanged", msg);
//                 return;
//             });
//         const response = { status: "ok" };
//         res.status(200).json(response);
//     } catch (error) {
//         log.info("Error");
//         log.info(error);
//         log.info(new Error().stack);

//         const response = {
//             result: false,
//             status: "UnknownError",
//         };
//         response.req = req.body;
//         res.status(200).json(response);
//     }
//     // try {
//     //     const estimatedGas = await srtContract.methods
//     //         .transferFrom(fromAddr, toAddr, amountValue)
//     //         .estimateGas();
//     //     log.info(estimatedGas);
//     // } catch (error) {
//     //     log.info("Error");
//     //     log.info(error);
//     //     const response = { result: false };
//     //     response.req = req.body;
//     //     res.status(200).json(response);
//     // }

//     // const feeRes = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=9SIZV9A731G8CTGWX8TIR158B8FHQB473U');
//     // const baseFee = feeRes.data.result["suggestBaseFee"];

//     // const signedTx = await web3.eth.accounts.signTransaction({
//     //         data: encodeABI,
//     //         from: account.address,
//     //         gas: web3.utils.toWei(String(Math.floor(parseFloat(baseFee) * estimatedGas) * 1.1), 'gwei'),
//     //         to: tokenAddress,
//     //     },
//     //     account.privateKey,
//     //     false
//     // );
//     // try {

//     //     const result = await web3.eth.sendSignedTransaction(
//     //         signedTx.rawTransaction
//     //     );

//     //     const response = { result: result };
//     //     response.req = req.body;
//     //     res.status(200).json(response);
//     // } catch (error) {
//     //     log.info("Error");
//     //     log.info(error);
//     //     const response = { result: false };
//     //     response.req = req.body;
//     //     res.status(200).json(response);
//     // }
// };

actions.transferAdmin = async function(req, res, next) {
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

    const account = await adminService.getAccountByPk(pk);

    try {
        const toAddr = req.body.toAddr;
        const receipt = adminService.transferToken(account, toAddr, amount);

        if (receipt.status === false) {
            const msg = "Reverted:" + receipt.transactionHash + ":" + toAddr + ":1";
            req.app.get("io").emit("TxStateChanged", msg);

            const response = { status: "TxFailed" };
            res.status(200).json(response);
            return;
        }

        const msg = "Done:" + receipt.transactionHash + ":" + toAddr + ":0";
        req.app.get("io").emit("TxStateChanged", msg);
        // log.info("Estimate Gas Price : " + gasPriceMore.toNumber());

        const isLocked = await adminService.isLocked(toAddr);
        if (!isLocked) {
            await adminService.lockWallet(account, toAddr);
        }

        const response = { status: "ok" };
        res.status(200).json(response);
    } catch (error) {
        log.info("Error");
        log.info(error.message);

        const response = {
            result: false,
            status: "UnknownError",
            user: { name: nameVal, phoneNum: phoneNumVal },
        };
        response.req = req.body;
        res.status(200).json(response);
    }
};

actions.transferFromByPk = async function(req, res, next) {
    const fromPk = req.body.fromPk;
    const toPk = req.body.toPk;
    const amount = req.body.amt;

    adminService
        .transferFrom(fromPk, toPk, amount)
        .then((receipt) => {
            log.info(`Tx Hash : ${receipt.transactionHash}`);
        })
        .catch((error) => {
            log.error(`Failed :: ${fromPk} :: error ${error.message}`);
        });

    const response = { status: "ok", toPk: toPk };
    res.status(200).json(response);
};

actions.airdrop = async function(req, res, next) {
    const fromPk = req.body.pk;
    const toPk = req.body.toAddr;
    const amount = req.body.amount;

    adminService.transferToken(fromPk, toPk, amount);
    
    const response = { status: "ok", address: toPk, balance: 0 };
    res.status(200).json(response);
};

actions.getTokenPrice = async function(req, res, next) {
    const response = {
        status: "ok",
        price: adminService.getSRTPriceByMXC()
    };

    res.status(200).json(response);
};

actions.checkAllowance = async function(req, res, next) {
    const _from = req.query.from;
    const _to = req.query.to;

    const value = await adminService.getAllowance(_from, _to);
    const balance = await adminService.getBalance(_from);
    const response = {
        status: "ok",
        allowances: value,
        balance: balance
    };

    res.status(200).json(response);
};

function genSocketMsg(status, txHash, addr, pk, balance, result) {
    const msg = `${status}:${txHash}:${addr}:${pk}:${balance.toString()}:${result.toString()}`;
    log.info(msg);
    return msg;
}

function genLockMessage(isLocked, address, balance, txHash, status) {
    if (isLocked) {
        return JSON.stringify({
            status: "Locked",
            address: address,
            balance: balance,
            txHash: txHash,
        });
    } else if (balance === 0 || balance.toString() === "0") {
        return JSON.stringify({
            status: "Empty",
            address: address,
            balance: balance,
            txHash: txHash,
        });
    } else {
        return JSON.stringify({
            status: status,
            address: address,
            balance: balance,
            txHash: txHash,
        });
    }
}

module.exports = actions;