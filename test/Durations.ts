import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Duration Management", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let rewards: SignerWithAddress;
  let addr1: SignerWithAddress;

  const MINUTE = 60;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const TIMESTAMP_BUFFER = 15 * MINUTE;

  const INITIAL_LOCK_SIZE = ethers.parseEther("100");
  const INITIAL_LOCK_DURATION = DAY * 2;
  const INITIAL_STAKE_DURATION = WEEK;
  const INITIAL_GOVERNANCE_DURATION = WEEK * 2;

  beforeEach(async function () {
    [owner, controller, addr1, rewards] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));

    const Hodler = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(Hodler, [
      await token.getAddress(),
      controller.address,
      INITIAL_LOCK_SIZE,
      INITIAL_LOCK_DURATION,
      INITIAL_STAKE_DURATION,
      INITIAL_GOVERNANCE_DURATION,
      rewards.address
    ]);
    await hodler.waitForDeployment();
  });

  describe("Duration Settings", function () {
    it("Should set lock duration with valid values", async function () {
      const newDuration = DAY * 3;
      // @ts-ignore
      await expect(hodler.connect(controller).setLockDuration(newDuration))
        .to.emit(hodler, "LockDurationUpdated")
        .withArgs(controller.address, INITIAL_LOCK_DURATION, newDuration);

      expect(await hodler.LOCK_DURATION()).to.equal(newDuration);
    });

    it("Should set stake duration with valid values", async function () {
      const newDuration = WEEK * 2;
      // @ts-ignore
      await expect(hodler.connect(controller).setStakeDuration(newDuration))
        .to.emit(hodler, "StakeDurationUpdated")
        .withArgs(controller.address, INITIAL_STAKE_DURATION, newDuration);

      expect(await hodler.STAKE_DURATION()).to.equal(newDuration);
    });

    it("Should set governance duration with valid values", async function () {
      const newDuration = WEEK * 3;
      // @ts-ignore
      await expect(hodler.connect(controller).setGovernanceDuration(newDuration))
        .to.emit(hodler, "GovernanceDurationUpdated")
        .withArgs(controller.address, INITIAL_GOVERNANCE_DURATION, newDuration);

      expect(await hodler.GOVERNANCE_DURATION()).to.equal(newDuration);
    });

    it("Should fail setting invalid durations", async function () {
      const invalidDuration = TIMESTAMP_BUFFER + DAY - 1; // Less than minimum required

      await expect(
        // @ts-ignore
        hodler.connect(controller).setLockDuration(invalidDuration)
      ).to.be.revertedWith("Invalid duration for locking");

      await expect(
        // @ts-ignore
        hodler.connect(controller).setStakeDuration(invalidDuration)
      ).to.be.revertedWith("Invalid duration for staking");

      await expect(
        // @ts-ignore
        hodler.connect(controller).setGovernanceDuration(invalidDuration)
      ).to.be.revertedWith("Invalid duration for governance");

      // Test with zero duration
      await expect(
        // @ts-ignore
        hodler.connect(controller).setLockDuration(0)
      ).to.be.revertedWith("Invalid duration for locking");
    });

    it("Should emit correct events on duration changes", async function () {
      const newLockDuration = DAY * 4;
      const newStakeDuration = WEEK * 2;
      const newGovernanceDuration = WEEK * 3;

      // @ts-ignore
      await expect(hodler.connect(controller).setLockDuration(newLockDuration))
        .to.emit(hodler, "LockDurationUpdated")
        .withArgs(controller.address, INITIAL_LOCK_DURATION, newLockDuration);
      // @ts-ignore
      await expect(hodler.connect(controller).setStakeDuration(newStakeDuration))
        .to.emit(hodler, "StakeDurationUpdated")
        .withArgs(controller.address, INITIAL_STAKE_DURATION, newStakeDuration);
      // @ts-ignore
      await expect(hodler.connect(controller).setGovernanceDuration(newGovernanceDuration))
        .to.emit(hodler, "GovernanceDurationUpdated")
        .withArgs(controller.address, INITIAL_GOVERNANCE_DURATION, newGovernanceDuration);
    });

    it("Should only allow controller to set durations", async function () {
      const newDuration = DAY * 3;

      await expect(
        // @ts-ignore
        hodler.connect(addr1).setLockDuration(newDuration)
      ).to.be.revertedWith(/AccessControl/);

      await expect(
        // @ts-ignore
        hodler.connect(addr1).setStakeDuration(newDuration)
      ).to.be.revertedWith(/AccessControl/);

      await expect(
        // @ts-ignore
        hodler.connect(addr1).setGovernanceDuration(newDuration)
      ).to.be.revertedWith(/AccessControl/);
    });
  });
});