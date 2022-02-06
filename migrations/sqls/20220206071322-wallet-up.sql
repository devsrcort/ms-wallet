/* Replace with your SQL commands */

CREATE TABLE `wallets` (
    `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
    `wallet_address` varchar(1000) NOT NULL DEFAULT '',
    `balance` int(11) unsigned NOT NULL DEFAULT 0,
    `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
