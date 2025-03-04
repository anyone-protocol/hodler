import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Hodler Vault Management", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: Signer;
  let controller: Signer;
  let user: Signer;
  let rewardsPool: Signer;
  
  const MINUTE = 60;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const TIMESTAMP_BUFFER = 15 * MINUTE;
  
  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = 7 * DAY;
  const STAKE_DURATION = 2 * DAY;
  const GOVERNANCE_DURATION = 30 * DAY;

  beforeEach(async function () {
    [owner, controller, user, rewardsPool] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));
    
    const Hodler = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(Hodler, [
      await token.getAddress(),
      await controller.getAddress(),
      LOCK_SIZE,
      LOCK_DURATION,
      STAKE_DURATION,
      GOVERNANCE_DURATION,
      await rewardsPool.getAddress()
    ]);
    await hodler.waitForDeployment();

    // @ts-ignore
    await token.connect(owner).transfer(await user.getAddress(), ethers.parseEther("1000"));
    // @ts-ignore
    await token.connect(user).approve(await hodler.getAddress(), ethers.MaxUint256);
  });

  it("Should correctly track vault entries", async function () {
    const userAddress = await user.getAddress();
    // @ts-ignore
    await hodler.connect(user).lock("test-fingerprint");
    // @ts-ignore
    await hodler.connect(user).unlock("test-fingerprint");

    // @ts-ignore
    const vaults = await hodler.connect(user).getVaults(userAddress);
    expect(vaults.length).to.be.gt(0);
    
    const vault = vaults[0];
    expect(vault.amount).to.equal(LOCK_SIZE);
    expect(vault.availableAt).to.be.gt(await time.latest());
  });

  it("Should respect TIMESTAMP_BUFFER when opening expired vaults", async function () {
    // @ts-ignore
    await hodler.connect(user).lock("test-fingerprint");
    // @ts-ignore
    await hodler.connect(user).unlock("test-fingerprint");

    // Try to open just before buffer period
    await time.increase(LOCK_DURATION - TIMESTAMP_BUFFER/2);
    // @ts-ignore
    await hodler.connect(user).openExpired();
    
    const hodlerData = await hodler.hodlers(await user.getAddress());
    expect(hodlerData.available).to.equal(0); // Should not be opened yet
  });

  it("Should only open truly expired vaults", async function () {
    // @ts-ignore
    await hodler.connect(user).lock("lock1");
    // @ts-ignore
    await hodler.connect(user).unlock("lock1");
    // @ts-ignore
    await hodler.connect(user).addVotes(LOCK_SIZE);
    // @ts-ignore
    await hodler.connect(user).removeVotes(LOCK_SIZE);

    await time.increase(LOCK_DURATION + TIMESTAMP_BUFFER);
    // @ts-ignore
    await hodler.connect(user).openExpired();

    const hodlerData = await hodler.hodlers(await user.getAddress());
    expect(hodlerData.available).to.equal(LOCK_SIZE); // Only first vault should be opened
  });

  it("Should update available balance after opening vaults", async function () {
    // @ts-ignore
    await hodler.connect(user).lock("test-fingerprint");
    // @ts-ignore
    await hodler.connect(user).unlock("test-fingerprint");

    // @ts-ignore
    const initial = await hodler.hodlers(await user.getAddress());
    
    await time.increase(LOCK_DURATION + TIMESTAMP_BUFFER);
    // @ts-ignore
    await hodler.connect(user).openExpired();

    // @ts-ignore
    const final = await hodler.hodlers(await user.getAddress());
    expect(final.available).to.equal(initial.available + LOCK_SIZE);
  });

  it("Should handle multiple vault entries correctly", async function () {
    // Create multiple vault entries
    for(let i = 0; i < 3; i++) {
      // @ts-ignore
      await hodler.connect(user).lock(`lock-${i}`);
      // @ts-ignore
      await hodler.connect(user).unlock(`lock-${i}`);
    }

    const userAddress = await user.getAddress();
    // @ts-ignore
    let vaults = await hodler.connect(user).getVaults(await user.getAddress());
    expect(vaults.length).to.equal(3);

    // Advance time and open expired vaults
    await time.increase(LOCK_DURATION + TIMESTAMP_BUFFER);
    // @ts-ignore
    await hodler.connect(user).openExpired();

    const hodlerData = await hodler.hodlers(userAddress);
    expect(hodlerData.available).to.equal(LOCK_SIZE * BigInt(3));
  });
});