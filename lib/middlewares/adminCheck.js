const cryptoJs = require('crypto-js');
const log = require("metalogger")();

exports.adminCheck = function(req, res, next) {
    if (process.env.ADMINPW == cryptoJs.SHA256(req.body.adminPw)) {
        next();
    } else {
        return res.status(403).json({
            message: 'Invaild admin certification',
        });
    }
};

exports.secretCheck = function(req, res, next) {
    if (process.env.SECRETKEY == cryptoJs.SHA256(req.body.secret)) {
        next();
    } else {
        return res.status(403).json({
            message: 'Invaild secret certification',
        });
    }
};