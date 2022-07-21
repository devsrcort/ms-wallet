const { spieler, check, matchedData, sanitize } = require("spieler")();

const router = require("express").Router({ mergeParams: true });
const actions = require("./actions");
const { adminCheck, secretCheck } = require("../../middlewares/adminCheck");

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

const sendTokenValidator = spieler([
  check("secret").exists().withMessage("secret met be provied").trim(),
  check("fromAddr").exists().withMessage("fromAddr met be provied").trim(),
  check("toAddr").exists().withMessage("toAddr met be provied").trim(),
  check("amount").exists().withMessage("amount met be provied").trim(),
  check("fee").exists().withMessage("fee met be provied").trim(),
]);

const emptyValidator = spieler([]);

const fromToWalletValidator = spieler([fromtoWalletValidator]);

// Function
router.get("/", emptyValidator, actions.empty);
router.post("/create_account", emptyValidator, actions.create_account);
router.get("/balanceof", emptyValidator, actions.balanceof);
router.post("/transferAdmin", trasferValidator, actions.transferAdmin);
router.get("/getTokenPrice", emptyValidator, actions.getTokenPrice);
router.post("/getTransferFee", emptyValidator, actions.getTransferFee);
router.post(
  "/sendTokenByClient",
  sendTokenValidator,
  secretCheck,
  actions.sendTokenByClient
);
router.post("/getTransferHistroy", walletValidator, actions.getTransferHistroy);

// For Management
router.get("/isBlackList", adminValidator, adminCheck, actions.CheckLocked);
router.post("/setGasBoost", adminValidator, adminCheck, actions.setGasBoost);
router.get("/checkAllowance", emptyValidator, actions.checkAllowance);
router.get("/checkEthBalance", emptyValidator, actions.checkEthBalance);

// For Admin
router.post(
  "/transferFromByPk",
  adminValidator,
  adminCheck,
  actions.transferFromByPk
);
router.post(
  "/approveByTransferFee",
  adminValidator,
  adminCheck,
  actions.approveByTransferFee
);
router.post(
  "/lockWalletList",
  adminValidator,
  adminCheck,
  actions.lockWalletList
);
router.post("/lockWallet", adminValidator, adminCheck, actions.lockWallet);

// Bulk Transfer and approve
router.post(
  "/transferFeeAsync",
  adminValidator,
  adminCheck,
  actions.transferFeeAsync
);
router.post("/approveAsync", adminValidator, adminCheck, actions.approveAsync);

// For Airdrop
router.post("/airdrop", adminValidator, adminCheck, actions.airdrop);

module.exports = router;
