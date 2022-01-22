const { spieler, check, matchedData, sanitize } = require('spieler')();

const router = require('express').Router({ mergeParams: true });
const actions = require('./actions');

const log = require("metalogger")();

const walletValidator = spieler([
    check('addr').exists().withMessage('addr met be provied')
    .trim()
]);

const fromtoWalletValidator = spieler([
    check('from_addr').exists().withMessage('from_addr met be provied')
    .trim(),

    check('to_addr').exists().withMessage('to_addr met be provied')
    .trim()
]);

const emptyValidator = spieler([

]);

const addrValidator = spieler([
    walletValidator,
    //dateTimeValidation
]);

const fromToWalletValidator = spieler([
    fromtoWalletValidator
]);

router.get('/', emptyValidator, actions.empty);
router.get('/create_account', emptyValidator, actions.create_account);
router.get('/approve', fromToWalletValidator, actions.approve);
router.get('/balanceof', walletValidator, actions.balanceof);
router.get('/lock', walletValidator, actions.lock);
router.get('/unlock', walletValidator, actions.unlock);

module.exports = router;