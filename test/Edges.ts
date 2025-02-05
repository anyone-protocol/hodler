import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Edge Cases", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  let users: SignerWithAddress[];

  const MAX_UINT256 = ethers.MaxUint256;

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
    [owner, controller, rewardsPool, ...users] = await ethers.getSigners();

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
      rewardsPool.address
    ]);
    await hodler.waitForDeployment();

    for (const user of users) {
      // @ts-ignore
      await token.connect(owner).transfer(user.address, 1000n * BigInt(1e18));
      // @ts-ignore
      await token.connect(user).approve(await hodler.getAddress(), MAX_UINT256);
    }
  });

  describe("Zero Value Transfers", function () {
    it("should revert when trying to stake zero amount", async function () {
      await expect(
        // @ts-ignore
        hodler.connect(users[0]).stake(users[1].address, 0)
      ).to.be.revertedWith("Insuficient amount for staking");
    });

    it("should revert when trying to withdraw zero amount", async function () {
      await expect(
        // @ts-ignore
        hodler.connect(users[0]).withdraw(0)
      ).to.be.revertedWith("Non-zero amount required");
    });
  });

  describe("Maximum Value Handling", function () {
    it("should handle maximum uint256 approval", async function () {
        // @ts-ignore
      await token.connect(users[0]).approve(await hodler.getAddress(), MAX_UINT256);
      const allowance = await token.allowance(users[0].address, await hodler.getAddress());
      expect(allowance).to.equal(MAX_UINT256);
    });

    it("should revert when trying to stake more than balance", async function () {
      const balance = await token.balanceOf(users[0].address);
      await expect(
        // @ts-ignore
        hodler.connect(users[0]).stake(users[1].address, balance + 1n)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });
});