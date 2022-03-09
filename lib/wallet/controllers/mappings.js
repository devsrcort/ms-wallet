const { spieler, check, matchedData, sanitize } = require("spieler")();

const router = require("express").Router({ mergeParams: true });
const actions = require("./actions");

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

const emptyValidator = spieler([]);

const fromToWalletValidator = spieler([fromtoWalletValidator]);

router.get("/", emptyValidator, actions.empty);
router.post("/create_account", emptyValidator, actions.create_account);
router.post("/approve", walletValidator, actions.approve);
router.get("/balanceof", walletValidator, actions.balanceof);
router.get("/lock", walletValidator, actions.lock);
router.get("/unlock", walletValidator, actions.unlock);
router.post("/transfer", trasferValidator, actions.transfer);
router.post("/transferFrom", transferFromValidator, actions.transferFrom);
router.post("/transferAdmin", trasferValidator, actions.transferAdmin);
router.post("/test", emptyValidator, actions.test);

router.get("/isBlackList", emptyValidator, actions.isBlackList);
router.post("/lockWalletList", emptyValidator, actions.lockWalletList);

module.exports = router;