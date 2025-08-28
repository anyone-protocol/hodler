import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Contract - Lock/Unlock Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  let controller: SignerWithAddress;

  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = 186400;
  const STAKE_DURATION = 286400;
  const GOVERNANCE_DURATION = 386400;
  const TIMESTAMP_BUFFER = 60 * 60; // 1 hour buffer

  beforeEach(async function () {
    [owner, user, rewardsPool, controller] = await ethers.getSigners();

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

  describe("Lock/Unlock Functions", function () {
    it("Should lock tokens with valid fingerprint", async function () {
      const fingerprint = "validFingerprint123";
      // @ts-ignore
      await hodler.connect(user).lock(fingerprint, user.address);

      // @ts-ignore
      const lockAmount = await hodler.connect(user).getLock(fingerprint, user.address)
      expect(lockAmount).to.equal(LOCK_SIZE);
    });

    it("Should fail locking with empty fingerprint", async function () {
      await expect(
        // @ts-ignore
        hodler.connect(user).lock("", user.address)
      ).to.be.revertedWith("Fingerprint must have non 0 characters");
    });

    it("Should fail locking with fingerprint > 40 chars", async function () {
      const longFingerprint = "a".repeat(41);
      await expect(
        // @ts-ignore
        hodler.connect(user).lock(longFingerprint, user.address)
      ).to.be.revertedWith("Fingerprint must have 40 or less characters");
    });

    it("Should lock using available balance first", async function () {
      // First add some available balance
      // @ts-ignore
      await hodler.connect(user).lock("fingerprint1", user.address);
      // @ts-ignore
      await hodler.connect(user).unlock("fingerprint1", user.address);
      await network.provider.send('evm_increaseTime', [LOCK_DURATION + TIMESTAMP_BUFFER]);
      await network.provider.send("evm_mine");
      // @ts-ignore
      await hodler.connect(user).openExpired();
      
      const initialBalance = await token.balanceOf(user.address);
      // @ts-ignore
      await hodler.connect(user).lock("fingerprint2", user.address);

      const finalBalance = await token.balanceOf(user.address);
      expect(finalBalance).to.equal(initialBalance); // Balance shouldn't change
    });

    it("Should transfer tokens when available balance insufficient", async function () {
      const initialBalance = await token.balanceOf(user.address);
      // @ts-ignore
      await hodler.connect(user).lock("fingerprint", user.address);

      const finalBalance = await token.balanceOf(user.address);
      expect(finalBalance).to.equal(initialBalance - LOCK_SIZE);
    });

    it("Should unlock tokens correctly", async function () {
      const fingerprint = "testFingerprint";
      // @ts-ignore
      await hodler.connect(user).lock(fingerprint, user.address);
      // @ts-ignore
      await hodler.connect(user).unlock(fingerprint, user.address);

      // @ts-ignore
      const lockAmount = await hodler.connect(user).getLock(fingerprint, user.address);
      expect(lockAmount).to.equal(0);
    });

    it("Should fail unlocking non-existent locks", async function () {
      await expect(
        // @ts-ignore
        hodler.connect(user).unlock("nonexistentFingerprint", user.address)
      ).to.be.revertedWith("No lock found for the fingerprint");
    });

    it("Should create vault entry after unlocking", async function () {
      const fingerprint = "testFingerprint";
      // @ts-ignore
      await hodler.connect(user).lock(fingerprint, user.address);
      // @ts-ignore
      await hodler.connect(user).unlock(fingerprint, user.address);

      // @ts-ignore
      const vaults = await hodler.connect(user).getVaults(user.address);
      
      expect(vaults.length).to.be.above(0);
      expect(vaults[0].amount).to.equal(LOCK_SIZE);
      expect(vaults[0].availableAt).to.be.above(0);
    });
  });
});