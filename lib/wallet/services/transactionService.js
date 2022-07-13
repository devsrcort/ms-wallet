const axios = require("axios");
const log = require("metalogger")();
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

class TransactionService {
  constructor() {
    this.initialBlock =
      process.env.NODE_ENV == "production" ? 13943739 : 6672764;

    this.tokenAddress =
      process.env.NODE_ENV == "production"
        ? "0x22987407FD1fC5A971e3FDA3B3e74C88666cDa91"
        : "0x19D6872C7Fc65E70a3b715470845918D8917b178";

    this.ethScanApiBase =
      process.env.NODE_ENV == "production"
        ? "https://api.etherscan.io/api"
        : "https://api-goerli.etherscan.io/api";

    const alchemyApiBase =
      process.env.NODE_ENV == "production"
        ? "https://eth-mainnet.alchemyapi.io/v2/"
        : "https://eth-goerli.alchemyapi.io/v2/";

    const apiUrl = alchemyApiBase + process.env.ALCHEMY_APIKEY;
    this.web3 = createAlchemyWeb3(apiUrl);
  }

  async getTransferHistroy(address) {
    const lastBlockNum = await this.web3.eth.getBlockNumber();

    const result = await axios
      .get(this.ethScanApiBase, {
        params: {
          module: "account",
          action: "tokentx",
          contractaddress: this.tokenAddress,
          address: address,
          startblock: this.initialBlock,
          endblock: lastBlockNum,
          sort: "desc",
          apikey: process.env.ETHSCAN_APIKEY,
        },
      })
      .catch((error) => {
        log.error(error.message);
        return [];
      });

      return result.data['result'];
  }
}

module.exports = TransactionService;