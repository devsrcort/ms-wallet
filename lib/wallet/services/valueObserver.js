const axios = require("axios");
const log = require("metalogger")();

class ValueObserver {
  constructor() {
    this.gasPrice = {
      SafeGasPrice: "24",
      ProposeGasPrice: "26",
      FastGasPrice: "30",
    };
    this.srtPrice = 0;
    this.ethPrice = {
      ethbtc: "0.06116",
      ethbtc_timestamp: "1624961308",
      ethusd: "1494.29",
      ethusd_timestamp: "1624961308",
    };

    this.apiBase =
      process.env.NODE_ENV == "production"
        ? "https://api.etherscan.io/api"
        : "https://api-goerli.etherscan.io/api";
      
    this.isGasBoosting = false;
    this.gasWeightTable = [2, 1.5, 1.3, 1.2, 1.1];
  }

  ObserveTokenPrice() {
    setInterval(
      async function () {
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

  ObserveGasPrice() {
    setInterval(
      async function () {
        const feeRes = await axios
          .get(this.apiBase, {
            params: {
              module: "gastracker",
              action: "gasoracle",
              apikey: process.env.ETHSCAN_APIKEY,
            },
          })
          .catch((error) => {
            return;
          });
        if (feeRes.status == 200) {
          this.gasPrice = feeRes.data.result;
        }
      }.bind(this),
      1000
    );
  }

  ObserveEthPrice() {
    setInterval(
      async function () {
        const ethRes = await axios
          .get(this.apiBase, {
            params: {
              module: "stats",
              action: "ethprice",
              apikey: process.env.ETHSCAN_APIKEY,
            },
          })
          .catch((error) => {
            return;
          });
        if (ethRes.status == 200) {
          this.ethPrice = ethRes.data.result.ethusd;
        }
      }.bind(this),
      1000
    );
  }

  getGasPrice(gasType) {
    let gasPrice = this.gasPrice[gasType];
    if (this.isGasBooting) {
      if (gasPrice < 10) {
        gasPrice = gasPrice * this.gasWeightTable[0];
      }
      else if (gasPrice < 20) {
        gasPrice = gasPrice * this.gasWeightTable[1];
      }
      else if (gasPrice < 30) {
        gasPrice = gasPrice * this.gasWeightTable[2];
      }
      else if (gasPrice < 40) {
        gasPrice = gasPrice * this.gasWeightTable[3];
      }
      else {
        gasPrice = gasPrice * this.gasWeightTable[4];
      }
    }
    else {
      if (gasPrice < 10) {
        gasPrice = 10;
      }
    }

    return gasPrice;
  }

  getTokenPrice() {
    return this.srtPrice;
  }

  getEthPrice() {
    return this.ethPrice;
  }

  startObserve() {
    this.ObserveTokenPrice();
    this.ObserveGasPrice();
    this.ObserveEthPrice();
  }

  boostStatus() {
    return this.isGasBoosting;
  }

  toggleGasBoostMode() {
    this.isGasBoosting = !this.isGasBoosting;
  }

  updateGasBoostTable(values) {
    this.gasWeightTable = values;
  }
}

module.exports = ValueObserver;
