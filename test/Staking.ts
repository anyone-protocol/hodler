import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { Contract, EtherscanProvider, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HodlerV5 Stake/Unstake Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let operator: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  let controller: SignerWithAddress;

  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = 186400;
  const MIN_STAKE_SIZE = ethers.parseEther("1");
  const STAKE_DURATION = 286400;
  const GOVERNANCE_DURATION = 386400;
  const STAKE_AMOUNT = 123n;
  const DEFAULT_REDEEM_COST = ethers.parseEther("0.0001");

  beforeEach(async function () {
    [owner, user, operator, rewardsPool, controller] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));
    
    const HodlerV5 = await ethers.getContractFactory("HodlerV5");
    hodler = await upgrades.deployProxy(HodlerV5, [
      await token.getAddress(),
      controller.address,
      LOCK_SIZE,
      LOCK_DURATION,
      MIN_STAKE_SIZE,
      STAKE_DURATION,
      GOVERNANCE_DURATION,
      rewardsPool.address,
      DEFAULT_REDEEM_COST
    ]);
    await hodler.waitForDeployment();

    // @ts-ignore
    await token.connect(owner).transfer(user.address, ethers.parseEther("1000"));
    // @ts-ignore
    await token.connect(user).approve(await hodler.getAddress(), ethers.MaxUint256);
  });

  describe("Staking", function () {
    it("Should stake tokens to operator address", async function () {
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, STAKE_AMOUNT);

      // @ts-ignore
      const stake = await hodler.connect(user).getStake(operator.address);

      expect(stake).to.equal(STAKE_AMOUNT);
    });

    it("Should use available balance first when staking", async function () {
      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: ethers.parseEther("1")
      });

      // @ts-ignore
      await token.connect(owner).transfer(rewardsPool.address, LOCK_SIZE);
      // @ts-ignore
      await token.connect(rewardsPool).approve(await hodler.getAddress(), LOCK_SIZE)

      // @ts-ignore
      const tx = await hodler.connect(controller).reward(
        user.address, LOCK_SIZE, ethers.parseEther("0"), ethers.parseEther("0.001"), false
      );

      const data = await hodler.hodlers(user.address)

      const initialBalance = await token.balanceOf(user.address);

      // @ts-ignore
      await hodler.connect(user).stake(operator.address, LOCK_SIZE);

      const finalBalance = await token.balanceOf(user.address);
      expect(finalBalance).to.equal(initialBalance); // Balance shouldn't change
    });

    it("Should transfer tokens when available balance insufficient", async function () {
      // @ts-ignore
      await token.connect(owner).transfer(user.address, STAKE_AMOUNT);
      
      const initialBalance = await token.balanceOf(user.address);
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, STAKE_AMOUNT);

      const finalBalance = await token.balanceOf(user.address);
      expect(finalBalance).to.equal(initialBalance - STAKE_AMOUNT);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      // @ts-ignore
      await token.connect(owner).transfer(user.address, STAKE_AMOUNT);
      
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, STAKE_AMOUNT);
    });

    it("Should unstake tokens correctly", async function () {
      // @ts-ignore
      const oldStake = await hodler.connect(user).getStake(operator.address);
      expect(oldStake).to.equal(STAKE_AMOUNT);
      // @ts-ignore
      await hodler.connect(user).unstake(operator.address, STAKE_AMOUNT);
      // @ts-ignore
      const stake = await hodler.connect(user).getStake(operator.address);
      expect(stake).to.equal(0);
    });

    it("Should fail unstaking with no stake found", async function () {
      // @ts-ignore
      await hodler.connect(user).unstake(operator.address, STAKE_AMOUNT); // Unstake all

      await expect(
        // @ts-ignore
        hodler.connect(user).unstake(operator.address, 1) // Try unstaking more
      ).to.be.revertedWith("No stake found for the operator address");
    });

    it("Should fail unstaking with insufficient stake", async function () {
      // @ts-ignore
      await hodler.connect(user).unstake(operator.address, STAKE_AMOUNT / 2n); // Unstake half

      await expect(
        // @ts-ignore
        hodler.connect(user).unstake(operator.address, STAKE_AMOUNT) // Try unstaking more
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should create vault entry after unstaking", async function () {
      // @ts-ignore
      const tx = await hodler.connect(user).unstake(operator.address, STAKE_AMOUNT);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const expectedAvailableAt = block!.timestamp + STAKE_DURATION;

      // Get the vault entries
      // @ts-ignore
      const vaults = await hodler.connect(user).getVaults(user.address);

      expect(vaults[0].amount).to.equal(STAKE_AMOUNT);
      expect(vaults[0].availableAt).to.equal(expectedAvailableAt);
    });
  });
});