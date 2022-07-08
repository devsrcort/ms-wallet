const axios = require("axios");
const log = require("metalogger")();

class ValueObserver {
    constructor() {
        this.gasPrice = undefined;
        this.srtPrice = 0;
        this.ethPrice = undefined;

        setInterval(
            async function() {
                const ethRes = await axios
                    .get("https://api.etherscan.io/api", {
                        params: {
                            module: "stats",
                            action: "ethprice",
                            apikey: process.env.ETHSCAN_APIKEY,
                        },
                    })
                    .catch((error) => {
                        log.error(error.message);
                    });
                this.ethPrice = ethRes.data.result.ethusd;
            }.bind(this),
            5000
        );

        setInterval(
            async function() {
                const feeRes = await axios
                    .get("https://api.etherscan.io/api", {
                        params: {
                            module: "gastracker",
                            action: "gasoracle",
                            apikey: process.env.ETHSCAN_APIKEY,
                        },
                    })
                    .catch((error) => {
                        log.error(error.message);
                    });
                log.info(feeRes.data.result);
                this.gasPrice = feeRes.data.result;
            }.bind(this),
            2000
        );

        setInterval(
            async function() {
                const srtPrice = await axios
                    .get("https://api.mexc.com/api/v3/ticker/bookTicker", {
                        params: {
                            symbol: "SRTUSDT",
                        },
                    })
                    .catch((error) => {
                        log.error(error.message);
                    });
                this.srtPrice = srtPrice.data.askPrice;
            }.bind(this),
            1000
        );
    }

    startObserve() {

    }

    ObserveTokenPrice() {

    }

    ObserveGasPrice() {

    }

    ObserveEthPrice() {}

    getGasPrice(gasType) {
        return process.env.NODE_ENV === "production" ?
            this.gasPrice[gasType] == undefined ? 0 : this.gasPrice[gasType] :
            3;
    }

    getTokenPrice() {
        return process.env.NODE_ENV === "production" ?
            this.srtPrice :
            0.0129;
    }

    getEthPrice() {
        return process.env.NODE_ENV === "production" ?
            this.ethPrice :
            1184.54;
    }
}

module.exports = ValueObserver;