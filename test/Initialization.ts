import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Initialization Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  let addr1: SignerWithAddress;

  const MINUTE = 60;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const TIMESTAMP_BUFFER = 1 * HOUR;

  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = TIMESTAMP_BUFFER + DAY + 1;
  const MIN_STAKE_SIZE = ethers.parseEther("1");
  const STAKE_DURATION = TIMESTAMP_BUFFER + DAY + 1;
  const GOVERNANCE_DURATION = TIMESTAMP_BUFFER + DAY + 1;
  const DEFAULT_REDEEM_COST = ethers.parseEther("0.0001");

  beforeEach(async function () {
    [owner, controller, rewardsPool, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));

    const Hodler = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(Hodler, [
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
  });

  describe("Initialization", function () {
    it("Should initialize with correct token address, controller, and parameters", async function () {
      expect(await hodler.tokenContract()).to.equal(await token.getAddress());
      expect(await hodler.controllerAddress()).to.equal(controller.address);
      expect(await hodler.LOCK_SIZE()).to.equal(LOCK_SIZE);
      expect(await hodler.LOCK_DURATION()).to.equal(LOCK_DURATION);
      expect(await hodler.MIN_STAKE_SIZE()).to.equal(MIN_STAKE_SIZE);
      expect(await hodler.STAKE_DURATION()).to.equal(STAKE_DURATION);
      expect(await hodler.GOVERNANCE_DURATION()).to.equal(GOVERNANCE_DURATION);
      expect(await hodler.rewardsPoolAddress()).to.equal(rewardsPool.address);
      expect(await hodler.DEFAULT_REDEEM_COST()).to.equal(DEFAULT_REDEEM_COST);
    });

    it("Should fail initialization with zero lock size", async function () {
      const Hodler = await ethers.getContractFactory("Hodler");
      await expect(
        upgrades.deployProxy(Hodler, [
          await token.getAddress(),
          controller.address,
          0, // zero lock size
          LOCK_DURATION,
          MIN_STAKE_SIZE,
          STAKE_DURATION,
          GOVERNANCE_DURATION,
          rewardsPool.address,
          DEFAULT_REDEEM_COST
        ])
      ).to.be.revertedWith("Lock size must be greater than 0");
    });

    it("Should fail initialization with zero min stake size", async function () {
      const Hodler = await ethers.getContractFactory("Hodler");
      await expect(
        upgrades.deployProxy(Hodler, [
          await token.getAddress(),
          controller.address,
          LOCK_SIZE,
          LOCK_DURATION,
          0, // zero min stake size
          STAKE_DURATION,
          GOVERNANCE_DURATION,
          rewardsPool.address,
          DEFAULT_REDEEM_COST
        ])
      ).to.be.revertedWith("Minimum stake size must be greater than 0");
    });

    it("Should fail initialization with invalid durations", async function () {
      const Hodler = await ethers.getContractFactory("Hodler");
      const invalidDuration = TIMESTAMP_BUFFER; // Too short duration

      // Test invalid lock duration
      await expect(
        upgrades.deployProxy(Hodler, [
          await token.getAddress(),
          controller.address,
          LOCK_SIZE,
          invalidDuration,
          MIN_STAKE_SIZE,
          STAKE_DURATION,
          GOVERNANCE_DURATION,
          rewardsPool.address,
          DEFAULT_REDEEM_COST
        ])
      ).to.be.revertedWith("Invalid duration for locking");

      // Test invalid stake duration
      await expect(
        upgrades.deployProxy(Hodler, [
          await token.getAddress(),
          controller.address,
          LOCK_SIZE,
          LOCK_DURATION,
          MIN_STAKE_SIZE,
          invalidDuration,
          GOVERNANCE_DURATION,
          rewardsPool.address,
          DEFAULT_REDEEM_COST
        ])
      ).to.be.revertedWith("Invalid duration for staking");

      // Test invalid governance duration
      await expect(
        upgrades.deployProxy(Hodler, [
          await token.getAddress(),
          controller.address,
          LOCK_SIZE,
          LOCK_DURATION,
          MIN_STAKE_SIZE,
          STAKE_DURATION,
          invalidDuration,
          rewardsPool.address,
          DEFAULT_REDEEM_COST
        ])
      ).to.be.revertedWith("Invalid duration for governance");
    });

    it("Should grant correct roles during initialization", async function () {
      const DEFAULT_ADMIN_ROLE = await hodler.DEFAULT_ADMIN_ROLE();
      const PAUSER_ROLE = await hodler.PAUSER_ROLE();
      const UPGRADER_ROLE = await hodler.UPGRADER_ROLE();
      const CONTROLLER_ROLE = await hodler.CONTROLLER_ROLE();

      expect(await hodler.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await hodler.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
      expect(await hodler.hasRole(UPGRADER_ROLE, owner.address)).to.be.true;
      expect(await hodler.hasRole(CONTROLLER_ROLE, controller.address)).to.be.true;
    });

    it("Should prevent double initialization", async function () {
      await expect(
        hodler.initialize(
          await token.getAddress(),
          controller.address,
          LOCK_SIZE,
          LOCK_DURATION,
          MIN_STAKE_SIZE,
          STAKE_DURATION,
          GOVERNANCE_DURATION,
          rewardsPool.address,
          DEFAULT_REDEEM_COST
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });
});