import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HodlerV5 Access Control Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let pauser: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let rewardsPool: SignerWithAddress
  let unauthorized: SignerWithAddress;

  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = 186400;
  const MIN_STAKE_SIZE = ethers.parseEther("1");
  const STAKE_DURATION = 286400;
  const GOVERNANCE_DURATION = 386400;
  const DEFAULT_REDEEM_COST = ethers.parseEther("0.0001");

  beforeEach(async function () {
    [owner, controller, pauser, upgrader, unauthorized, rewardsPool] = await ethers.getSigners();

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
      DEFAULT_REDEEM_COST,
    ]);
    await hodler.waitForDeployment();

    await hodler.grantRole(await hodler.PAUSER_ROLE(), pauser.address);
    await hodler.grantRole(await hodler.UPGRADER_ROLE(), upgrader.address);
  });

  describe("DEFAULT_ADMIN_ROLE permissions", function () {
    it("should allow admin to grant roles", async function () {
      const newPauser = unauthorized.address;
      await expect(hodler.grantRole(await hodler.PAUSER_ROLE(), newPauser))
        .to.not.be.reverted;
      expect(await hodler.hasRole(await hodler.PAUSER_ROLE(), newPauser)).to.be.true;
    });

    it("should allow admin to execute emergency withdraw when paused", async function () {
      // @ts-ignore
      await hodler.connect(pauser).pause();
      await expect(hodler.emergencyWithdraw()).to.not.be.reverted;
    });

    it("should prevent non-admin from executing emergency withdraw", async function () {
      // @ts-ignore
      await hodler.connect(pauser).pause();
      // @ts-ignore
      await expect(hodler.connect(unauthorized).emergencyWithdraw())
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");
    });
  });

  describe("PAUSER_ROLE permissions", function () {
    it("should allow pauser to pause the contract", async function () {
        // @ts-ignore
      await expect(hodler.connect(pauser).pause()).to.not.be.reverted;
      expect(await hodler.paused()).to.be.true;
    });

    it("should allow pauser to unpause the contract", async function () {
      // @ts-ignore
      await hodler.connect(pauser).pause();
      // @ts-ignore
      await expect(hodler.connect(pauser).unpause()).to.not.be.reverted;
      expect(await hodler.paused()).to.be.false;
    });

    it("should prevent unauthorized accounts from pausing", async function () {
      // @ts-ignore
      await expect(hodler.connect(unauthorized).pause())
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");
    });
  });

  describe("UPGRADER_ROLE permissions", function () {
    it("should allow upgrader to upgrade the contract", async function () {
      const HodlerV6 = await ethers.getContractFactory("HodlerV6Mock", upgrader);
      
      await expect(upgrades.upgradeProxy(await hodler.getAddress(), HodlerV6, { kind: "uups" }))
        .to.not.be.reverted;
    });

    it("should prevent unauthorized accounts from upgrading", async function () {
      const HodlerV4 = await ethers.getContractFactory("HodlerV4Mock", unauthorized);
      
      await expect(upgrades.upgradeProxy(await hodler.getAddress(), HodlerV4))
        .to.be.reverted;
    });
  });

  describe("CONTROLLER_ROLE permissions", function () {
    it("should allow controller to set lock size", async function () {
      const newLockSize = ethers.parseEther("200");
      // @ts-ignore
      await expect(hodler.connect(controller).setLockSize(newLockSize))
        .to.not.be.reverted;
      expect(await hodler.LOCK_SIZE()).to.equal(newLockSize);
    });

    it("should allow controller to reward users", async function () {
      const relayRewardAmount = ethers.parseEther("10");
      const stakingRewardAmount = ethers.parseEther("1");
      const gasEstimate = 21000;
      
      // check is to see if controller can call function, not if it executes correctly
      // @ts-ignore
      await expect(hodler.connect(controller).reward(unauthorized.address, relayRewardAmount, stakingRewardAmount, gasEstimate, false))
        .to.be.revertedWith("Insufficient gas budget for hodler account");
    });

    it("should prevent unauthorized accounts from controller functions", async function () {
      const newLockSize = ethers.parseEther("200");
      // @ts-ignore
      await expect(hodler.connect(unauthorized).setLockSize(newLockSize))
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Unauthorized access prevention", function () {
    it("should prevent unauthorized access to restricted functions", async function () {
      // @ts-ignore
      await expect(hodler.connect(unauthorized).emergencyWithdraw())
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");

      // @ts-ignore
      await expect(hodler.connect(unauthorized).pause())
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");

      // @ts-ignore
      await expect(hodler.connect(unauthorized).setLockSize(LOCK_SIZE))
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");

      // @ts-ignore
      await expect(hodler.connect(unauthorized).setLockDuration(LOCK_DURATION))
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");

      const PAUSER_ROLE = await hodler.PAUSER_ROLE();
      // @ts-ignore
      await expect(hodler.connect(unauthorized).grantRole(PAUSER_ROLE, unauthorized.address))
        .to.be.revertedWithCustomError(hodler, "AccessControlUnauthorizedAccount");
    });
  });
});