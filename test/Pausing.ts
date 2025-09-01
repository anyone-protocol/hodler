import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Contract Pause Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardsPool: SignerWithAddress
  
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const LOCK_SIZE = ethers.parseEther("100");
  const ONE_DAY = 24 * 60 * 60;
  const MIN_STAKE_SIZE = ethers.parseEther("1");
  const LOCK_DURATION = ONE_DAY * 7;
  const STAKE_DURATION = ONE_DAY * 14;
  const GOVERNANCE_DURATION = ONE_DAY * 30;

  beforeEach(async function () {
    [owner, controller, rewardsPool, user] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));
    

    // Deploy Hodler contract
    const Hodler = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(Hodler, [
      await token.getAddress(),
      controller.address,
      LOCK_SIZE,
      LOCK_DURATION,
      MIN_STAKE_SIZE,
      STAKE_DURATION,
      GOVERNANCE_DURATION,
      rewardsPool.address
    ]);
    await hodler.waitForDeployment();
  });

  describe("Pause/Unpause Functionality", function () {
    it("Should pause contract operations", async function () {
      // Pause the contract
      // @ts-ignore
      await hodler.connect(owner).pause();
      
      expect(await hodler.paused()).to.be.true;
    });

    it("Should unpause contract operations", async function () {
      // First pause
      // @ts-ignore
      await hodler.connect(owner).pause();
      expect(await hodler.paused()).to.be.true;

      // Then unpause
      // @ts-ignore
      await hodler.connect(owner).unpause();
      expect(await hodler.paused()).to.be.false;
    });

    it("Should prevent operations while paused", async function () {
      // Setup: Approve tokens and mint some tokens to user
      // @ts-ignore
      await token.connect(owner).transfer(user.address, LOCK_SIZE);
      // @ts-ignore
      await token.connect(user).approve(await hodler.getAddress(), LOCK_SIZE);

      // Pause the contract
      // @ts-ignore
      await hodler.connect(owner).pause();

      // Try to perform operations while paused
      await expect(
        // @ts-ignore
        hodler.connect(user).lock("testFingerprint", user.address)
      ).to.be.revertedWith("Pausable: paused");

      await expect(
        // @ts-ignore
        hodler.connect(user).stake(controller.address, LOCK_SIZE)
      ).to.be.revertedWith("Pausable: paused");

      await expect(
        // @ts-ignore
        hodler.connect(user).addVotes(LOCK_SIZE)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow emergency withdrawal when paused", async function () {
      const amount = ethers.parseEther("1000");
      // @ts-ignore
      await token.connect(owner).transfer(await hodler.getAddress(), amount);
      // @ts-ignore
      await hodler.connect(owner).pause();

      const initialTokenBalance = await token.balanceOf(owner.address);

      // @ts-ignore
      await hodler.connect(owner).emergencyWithdraw();

      const finalTokenBalance = await token.balanceOf(owner.address);
      expect(finalTokenBalance - initialTokenBalance).to.equal(amount);
    });
  });
});