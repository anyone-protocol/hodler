import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Rewards and Gas Management", function () {
  const oneEth = ethers.parseEther("1.0");

  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardsPool: SignerWithAddress
  
  const LOCK_SIZE = ethers.parseEther("100");
  const ONE_DAY = 24 * 60 * 60;
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
      STAKE_DURATION,
      GOVERNANCE_DURATION,
      rewardsPool.address
    ]);
    await hodler.waitForDeployment();
  });

  describe("Gas and Rewards Management", function () {
    it("Should process received ETH correctly", async function () {
      const initialControllerBalance = await ethers.provider.getBalance(controller.address);
      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: oneEth
      });

      const userData = await hodler.hodlers(user.address);
      expect(userData.gas).to.equal(oneEth);
      const controllerBalance = await ethers.provider.getBalance(controller.address);
      expect(controllerBalance).to.equal(oneEth + initialControllerBalance);
    });

    it("Should update gas budget", async function () {
      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: oneEth
      });

      const userData = await hodler.hodlers(user.address);
      expect(userData.gas).to.be.gt(0);
      
      await expect(user.sendTransaction({
        to: await hodler.getAddress(),
        value: oneEth
      }))
        .to.emit(hodler, "UpdateRewards")
    });

    it("Should transfer ETH to controller", async function () {
      const initialControllerBalance = await ethers.provider.getBalance(controller.address);

      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: oneEth
      });

      const finalControllerBalance = await ethers.provider.getBalance(controller.address);
      expect(finalControllerBalance - initialControllerBalance).to.equal(oneEth);
    });

    it("Should track gas estimates correctly", async function () {
      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: oneEth
      });

      const reward = ethers.parseEther("10")
      const gasEstimate = 1_000_000n

      // @ts-ignore
      await token.connect(owner).transfer(rewardsPool.address, reward);

      // @ts-ignore
      await token.connect(rewardsPool).approve(await hodler.getAddress(), reward)

      // @ts-ignore
      const tx = await hodler.connect(controller).reward(
        user.address,
        reward,
        gasEstimate,
        false
      );
      
      const userData = await hodler.hodlers(user.address);
      expect(userData.gas).to.equal(oneEth - gasEstimate);
    });

    it("Should allow controller to distribute rewards", async function () {
      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: oneEth
      });

      const rewardAmount = ethers.parseEther("10");

      // @ts-ignore
      await token.connect(owner).transfer(rewardsPool.address, rewardAmount);

      // @ts-ignore
      await token.connect(rewardsPool).approve(await hodler.getAddress(), rewardAmount);
      
      // @ts-ignore
      await expect(hodler.connect(controller).reward(
        user.address,
        rewardAmount,
        10000,
        false
      ))
        .to.emit(hodler, "Rewarded")
        .withArgs(user.address, rewardAmount, false);

      const userData = await hodler.hodlers(user.address);
      expect(userData.available).to.equal(rewardAmount);
    });

    it("Should fail rewards with insufficient gas budget", async function () {
      // Send small amount of ETH
      await user.sendTransaction({
        to: await hodler.getAddress(),
        value: ethers.parseEther("0.01")
      });

      // Try to reward with high gas estimate
      await expect(
        // @ts-ignore
        hodler.connect(controller).reward(
          user.address,
          ethers.parseEther("10"),
          ethers.parseEther("1.0"),
          false
        )
      ).to.be.revertedWith("Insufficient gas budget for hodler account");
    });
  });
});