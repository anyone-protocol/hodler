import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { Contract, EtherscanProvider, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Stake/Unstake Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let operator: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  let controller: SignerWithAddress;

  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = 186400;
  const STAKE_DURATION = 286400;
  const GOVERNANCE_DURATION = 386400;
  const STAKE_AMOUNT = 123n;

  beforeEach(async function () {
    [owner, user, operator, rewardsPool, controller] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));
    
    const Hodler = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(Hodler, [
      await token.getAddress(),
      controller.address,
      LOCK_SIZE,
      LOCK_DURATION,
      STAKE_DURATION,
      GOVERNANCE_DURATION,
      rewardsPool.address
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
      await token.connect(user).transfer(await hodler.getAddress(), ethers.parseEther("1"));

      // @ts-ignore
      await token.connect(owner).transfer(rewardsPool.address, LOCK_SIZE);
      // @ts-ignore
      await token.connect(rewardsPool).approve(await hodler.getAddress(), LOCK_SIZE)

      // @ts-ignore
      const tx = await hodler.connect(controller).reward(
        user.address, LOCK_SIZE, ethers.parseEther("0.001"), false
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

    it("Should fail unstaking with insufficient stake", async function () {
      // @ts-ignore
      await hodler.connect(user).unstake(operator.address, STAKE_AMOUNT); // First unstake

      await expect(
        // @ts-ignore
        hodler.connect(user).unstake(operator.address, 1)
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should create vault entry after unstaking", async function () {
      // @ts-ignore
      const tx = await hodler.connect(user).unstake(operator.address, STAKE_AMOUNT);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const expectedAvailableAt = block!.timestamp + STAKE_DURATION;

      // Get the vault entries
      // @ts-ignore
      const vaults = await hodler.connect(user).getVaults();

      expect(vaults[0].amount).to.equal(STAKE_AMOUNT);
      expect(vaults[0].availableAt).to.equal(expectedAvailableAt);
    });
  });
});