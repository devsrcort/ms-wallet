const { spieler, check, matchedData, sanitize } = require("spieler")();

const router = require("express").Router({ mergeParams: true });
const actions = require("./actions");
const adminCheck = require("../../middlewares/adminCheck");

const log = require("metalogger")();

const walletValidator = spieler([
    check("addr").exists().withMessage("addr met be provied").trim(),
]);

const fromtoWalletValidator = spieler([
    check("from_addr").exists().withMessage("from_addr met be provied").trim(),

    check("to_addr").exists().withMessage("to_addr met be provied").trim(),
]);

const trasferValidator = spieler([
    check("toAddr").exists().withMessage("address met be provied").trim(),

    check("amount").exists().withMessage("amount met be provied").trim(),

    check("pk").exists().withMessage("to_addr met be provied").trim(),
]);

const transferFromValidator = spieler([
    check("toAddr").exists().withMessage("address met be provied").trim(),

    check("amount").exists().withMessage("amount met be provied").trim(),

    check("pk").exists().withMessage("to_addr met be provied").trim(),
    check("fromAddr").exists().withMessage("to_addr met be provied").trim(),
]);

const adminValidator = spieler([
    check("adminPw").exists().withMessage("adminPw met be provied").trim(),
]);

const emptyValidator = spieler([]);

const fromToWalletValidator = spieler([fromtoWalletValidator]);

router.get("/", emptyValidator, actions.empty);
router.post("/create_account", emptyValidator, actions.create_account);
router.post("/approve", emptyValidator, actions.onlyApprove);
router.get("/balanceof", emptyValidator, actions.balanceof);
router.post("/transfer", trasferValidator, actions.transfer);
router.post("/transferFrom", transferFromValidator, actions.transferFrom);
router.post("/transferAdmin", trasferValidator, actions.transferAdmin);
router.get("/getTokenPrice", emptyValidator, actions.getTokenPrice);

// For Admin
router.get("/isBlackList", adminValidator, adminCheck.adminCheck, actions.CheckLocked);

router.post("/transferFromByPk", adminValidator, adminCheck.adminCheck, actions.transferFromByPk);
router.post("/approveByTransferFee", adminValidator, adminCheck.adminCheck, actions.approveByTransferFee);
router.post("/lockWalletList", adminValidator, adminCheck.adminCheck, actions.lockWalletList);

router.post("/airdrop", adminValidator, adminCheck.adminCheck, actions.airdrop);

module.exports = router;