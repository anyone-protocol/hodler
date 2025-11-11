import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, Signer } from "ethers";

describe("HodlerV3 Withdrawal Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: Signer;
  let controller: Signer;
  let user: Signer;
  let rewardsPool: Signer;
  
  const MINUTE = 60;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  
  const LOCK_SIZE = ethers.parseEther("100");
  const LOCK_DURATION = 7 * DAY;
  const MIN_STAKE_SIZE = ethers.parseEther("1");
  const STAKE_DURATION = 2 * DAY;
  const GOVERNANCE_DURATION = 30 * DAY;
  const INITIAL_BALANCE = ethers.parseEther("1000")
  const DEFAULT_REDEEM_COST = ethers.parseEther("0.0001");

  beforeEach(async function () {
    [owner, controller, user, rewardsPool] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));
    
    const HodlerV3 = await ethers.getContractFactory("HodlerV3");
    hodler = await upgrades.deployProxy(HodlerV3, [
      await token.getAddress(),
      await controller.getAddress(),
      LOCK_SIZE,
      LOCK_DURATION,
      MIN_STAKE_SIZE,
      STAKE_DURATION,
      GOVERNANCE_DURATION,
      await rewardsPool.getAddress(),
      DEFAULT_REDEEM_COST
    ]);
    await hodler.waitForDeployment();

    // @ts-ignore
    await token.connect(owner).transfer(await rewardsPool.getAddress(), INITIAL_BALANCE);
    // @ts-ignore
    await token.connect(owner).transfer(await user.getAddress(), INITIAL_BALANCE);
    // @ts-ignore
    await token.connect(user).approve(await hodler.getAddress(), ethers.MaxUint256);
  
    // @ts-ignore
    await token.connect(rewardsPool).approve(await hodler.getAddress(), ethers.parseEther("100"))
    // @ts-ignore
    await hodler.connect(controller).reward(user.address, ethers.parseEther("100"), 0, 0, false);
  });

  describe("Withdrawal Tests", function () {
    it("Should allow withdrawal of available tokens", async function () {
      const withdrawAmount = ethers.parseEther("50");
      
      const beforeBalance = await token.balanceOf(await user.getAddress());
      // @ts-ignore
      await hodler.connect(user).withdraw(withdrawAmount);
      const afterBalance = await token.balanceOf(await user.getAddress());

      expect(afterBalance - beforeBalance).to.equal(withdrawAmount);
    });

    it("Should fail withdrawal exceeding available balance", async function () {
      const excessAmount = INITIAL_BALANCE + ethers.parseEther("1");

      await expect(
        // @ts-ignore
        hodler.connect(user).withdraw(excessAmount)
      ).to.be.revertedWith("Insufficient available balance");
    });

    it("Should update balances correctly after withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("30");
      
      const beforeAvailable = (await hodler.hodlers(await user.getAddress())).available;
      // @ts-ignore
      await hodler.connect(user).withdraw(withdrawAmount);
      const afterAvailable = (await hodler.hodlers(await user.getAddress())).available;

      expect(beforeAvailable - afterAvailable).to.equal(withdrawAmount);
    });

    it("Should emit correct withdrawal events", async function () {
      const withdrawAmount = ethers.parseEther("20");
      // @ts-ignore  
      await expect(hodler.connect(user).withdraw(withdrawAmount))
        .to.emit(hodler, "Withdrawn")
        .withArgs(await user.getAddress(), withdrawAmount);
    });
  });
});