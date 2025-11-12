import "@nomicfoundation/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-chai-matchers";

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 5
      },
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      timeout: 6800000
    },
    sepolia: {
      url: "https://sepolia.infura.io/v3/cfed69d3b4fd4630b1957335cdb517cb",
      accounts: [],
      gas: "auto", 
      gasPrice: "auto", 
      gasMultiplier: 10,
      gasLimit: 1_000_000_000_000_000_000,
      timeout: 600000 // 10 minutes
    },
    localhost: {
      timeout: 18000000
    }
  },
};

export default config;