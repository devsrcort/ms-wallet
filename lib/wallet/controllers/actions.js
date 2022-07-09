/* jshint -W079 */
const Promise = require("bluebird"),
    config = require("config"),
    log = require("metalogger")(),
    axios = require("axios"),
    representor = require("kokua"),
    _ = require("lodash");

const AdminService = require("wallet/services/adminService");
const BulkService = require("wallet/services/bulkService");
const ValueObserver = require("wallet/services/valueObserver");

const bulkService = new BulkService();
const valueObserver = new ValueObserver();

const actions = {},
    adminService = new AdminService(valueObserver);

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

actions.transferFeeAsync = async function(req, res, next) {
    const toPk = req.body.toPk;
    const fromPk = req.body.fromPk;
    const ownerAccount = await adminService.getAccountByPk(toPk);
    const account = await adminService.getAccountByPk(fromPk);

    /// Temp
    bulkService.emitSendFeeByAdminBulk(ownerAccount, account)
        .catch((error) => {
            const response = { status: "failed" };
            res.status(500).json(response);
            return;
        });

    const response = { status: "ok" };
    res.status(200).json(response);
};

actions.approveAsync = async function(req, res, next) {
    const toPk = req.body.toPk;
    const fromPk = req.body.fromPk;
    const ownerAccount = await adminService.getAccountByPk(toPk);
    const account = await adminService.getAccountByPk(fromPk);

    /// Temp
    bulkService.emitApproveByAdminBuk(ownerAccount, account)
        .catch((error) => {
            const response = { status: "failed" };
            res.status(500).json(response);
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
        price: valueObserver.getTokenPrice()
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

actions.checkEthBalance = async function(req, res, next) {
    const addr = req.query.addr;

    const value = await bulkService.getEthBalance(addr);
    const balance = await adminService.getBalance(addr);

    const response = {
        status: "ok",
        ethBalance: value,
        balance: balance
    };

    res.status(200).json(response);
};

actions.getTransferFee = async function(req, res, next) {
    const fromAddr = req.body.fromAddr;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;
    const fee = req.body.fee;

    const feeValue = await adminService.getDisplayiedFeeAmount(fromAddr, toAddr, amount, fee);

    const response = {
        status: "ok",
        fee: feeValue,
    };

    res.status(200).json(response);
};

actions.sendTokenByClient = async function(req, res, next) {
    const fromAddr = req.body.fromAddr;
    const toAddr = req.body.toAddr;
    const amount = req.body.amount;
    const fee = req.body.fee;

    if (fromAddr == "" || toAddr == "" || amount == 0 || amount == "0") {
        const response = {
            status: "failed"
        };

        res.status(500).json(response);
        return;
    }
    try {
        await adminService.transferTokenByClient(fromAddr, toAddr, amount, fee);
        const response = {
            status: "ok"
        };

        res.status(200).json(response);
    } catch (error) {
        log.error(error);
        const response = {
            status: "failed"
        };

        res.status(500).json(response);
    }

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