// require('babel-register');
// require('babel-polyfill');
require('chai/register-should');
const path = require("path");
require('dotenv').config();
const mnemonic = process.env.MNENOMIC;
const HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
  plugins: ["truffle-security"],
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  compilers: {
    solc: {
      version: "0.5.11",
      optimizer: {
        enabled: true,
        runs: 200 // 1 = less size on deploy, 200 or more = less size on calls
      }
    }
  },
  networks: {
    // development: {
    //   host: "127.0.0.1",
    //   port: 8545,
    //   network_id: "*",
    // },
    ropsten: {
      provider: function() {
        return new HDWalletProvider(mnemonic, 'https://ropsten.infura.io/v3/' + process.env.INFURA_API_KEY)
      },
      network_id: '3',
      gas: 4465030,
      gasPrice: 10000000000,
    },
    kovan: {
      provider: function() {
        return new HDWalletProvider(mnemonic, 'https://kovan.infura.io/v3/' + process.env.INFURA_API_KEY)
      },
      network_id: '42',
      gas: 4465030,
      gasPrice: 10000000000,
    },
    rinkeby: {
      provider: () => new HDWalletProvider(process.env.MNENOMIC, "https://rinkeby.infura.io/v3/" + process.env.INFURA_API_KEY),
      network_id: 4,
      gas: 3000000,
      gasPrice: 10000000000
    },
    // main ethereum network(mainnet)
    main: {
      provider: () => new HDWalletProvider(process.env.MNENOMIC, "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY),
      network_id: 1,
      gas: 3000000,
      gasPrice: 10000000000
    }
  },
  mocha: {
    useColors: true,
    // reporter: 'eth-gas-reporter',
    // reporterOptions : {
    //   currency: 'EUR',
    //   gasPrice: 5,
    //   onlyCalledMethods: false
    // }
  }
};