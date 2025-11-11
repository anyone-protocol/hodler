import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("HodlerV3 Voting Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let controller: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  let operator: SignerWithAddress;
  
  const LOCK_SIZE = ethers.parseEther("100");
  const ONE_DAY = 24 * 60 * 60;
  const LOCK_DURATION = ONE_DAY * 7;
  const MIN_STAKE_SIZE = ethers.parseEther("1");
  const STAKE_DURATION = ONE_DAY * 14;
  const GOVERNANCE_DURATION = ONE_DAY * 30;
  const DEFAULT_REDEEM_COST = ethers.parseEther("0.0001");

  beforeEach(async function () {
    [owner, user, user2, controller, rewardsPool, operator] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18))
    
    // Deploy HodlerV3 contract
    const HodlerV3 = await ethers.getContractFactory("HodlerV3");
    hodler = await upgrades.deployProxy(HodlerV3, [
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

    // Transfer tokens to users
    await token.transfer(user.address, ethers.parseEther("10000"));
    await token.transfer(user2.address, ethers.parseEther("10000"));
    // @ts-ignore
    await token.connect(user).approve(await hodler.getAddress(), ethers.MaxUint256);
    // @ts-ignore
    await token.connect(user2).approve(await hodler.getAddress(), ethers.MaxUint256);
  });

  describe("Voting Tests", function () {
    it("Should allow user to become a voter", async function () {
      // @ts-ignore
      await hodler.connect(user).becomeVoter();

      const userData = await hodler.hodlers(user.address);
      expect(userData.isVoter).to.be.true;
    });

    it("Should fail if user tries to become voter twice", async function () {
      // @ts-ignore
      await hodler.connect(user).becomeVoter();
      
      await expect(
        // @ts-ignore
        hodler.connect(user).becomeVoter()
      ).to.be.revertedWith("Already a voter");
    });

    it("Should emit AddedVotes event when becoming voter with existing stakes", async function () {
      const stakeAmount1 = ethers.parseEther("100");
      const stakeAmount2 = ethers.parseEther("50");
      
      // Stake before becoming voter
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, stakeAmount1);
      // @ts-ignore
      await hodler.connect(user).stake(user2.address, stakeAmount2);
      
      // Become voter - should emit AddedVotes with total stakes
      await expect(
        // @ts-ignore
        hodler.connect(user).becomeVoter()
      ).to.emit(hodler, "AddedVotes")
        .withArgs(user.address, stakeAmount1 + stakeAmount2);
    });

    it("Should not emit AddedVotes event when becoming voter with no stakes", async function () {
      // Become voter without any stakes
      await expect(
        // @ts-ignore
        hodler.connect(user).becomeVoter()
      ).to.not.emit(hodler, "AddedVotes");
    });

    it("Should emit AddedVotes when voter stakes", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      // First become a voter
      // @ts-ignore
      await hodler.connect(user).becomeVoter();
      
      // Then stake - should emit AddedVotes
      await expect(
        // @ts-ignore
        hodler.connect(user).stake(operator.address, stakeAmount)
      ).to.emit(hodler, "AddedVotes")
        .withArgs(user.address, stakeAmount);
    });

    it("Should not emit AddedVotes when non-voter stakes", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      // Stake without being a voter - should not emit AddedVotes
      await expect(
        // @ts-ignore
        hodler.connect(user).stake(operator.address, stakeAmount)
      ).to.not.emit(hodler, "AddedVotes");
    });

    it("Should emit RemovedVotes when voter unstakes", async function () {
      const stakeAmount = ethers.parseEther("100");
      const unstakeAmount = ethers.parseEther("50");
      
      // Stake and become voter
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, stakeAmount);
      // @ts-ignore
      await hodler.connect(user).becomeVoter();
      
      // Unstake - should emit RemovedVotes
      await expect(
        // @ts-ignore
        hodler.connect(user).unstake(operator.address, unstakeAmount)
      ).to.emit(hodler, "RemovedVotes")
        .withArgs(user.address, unstakeAmount);
    });

    it("Should not emit RemovedVotes when non-voter unstakes", async function () {
      const stakeAmount = ethers.parseEther("100");
      const unstakeAmount = ethers.parseEther("50");
      
      // Stake without being a voter
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, stakeAmount);
      
      // Unstake - should not emit RemovedVotes
      await expect(
        // @ts-ignore
        hodler.connect(user).unstake(operator.address, unstakeAmount)
      ).to.not.emit(hodler, "RemovedVotes");
    });

    it("Should use GOVERNANCE_DURATION for voter unstake vaults", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      // Stake and become voter
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, stakeAmount);
      // @ts-ignore
      await hodler.connect(user).becomeVoter();
      
      const timestampBefore = await time.latest();
      
      // Unstake
      // @ts-ignore
      await hodler.connect(user).unstake(operator.address, stakeAmount);
      
      // @ts-ignore
      const vaults = await hodler.getVaults(user.address);
      const vault = vaults[vaults.length - 1];
      
      // Should use GOVERNANCE_DURATION instead of STAKE_DURATION
      expect(vault.availableAt).to.be.closeTo(
        timestampBefore + GOVERNANCE_DURATION,
        5 // Allow 5 second tolerance for block time
      );
    });

    it("Should use STAKE_DURATION for non-voter unstake vaults", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      // Stake without being a voter
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, stakeAmount);
      
      const timestampBefore = await time.latest();
      
      // Unstake
      // @ts-ignore
      await hodler.connect(user).unstake(operator.address, stakeAmount);
      
      // @ts-ignore
      const vaults = await hodler.getVaults(user.address);
      const vault = vaults[vaults.length - 1];
      
      // Should use STAKE_DURATION
      expect(vault.availableAt).to.be.closeTo(
        timestampBefore + STAKE_DURATION,
        5 // Allow 5 second tolerance for block time
      );
    });

    it("Should track multiple stakes and emit correct vote amounts", async function () {
      const stake1 = ethers.parseEther("100");
      const stake2 = ethers.parseEther("75");
      const stake3 = ethers.parseEther("25");
      
      // Stake to different operators
      // @ts-ignore
      await hodler.connect(user).stake(operator.address, stake1);
      // @ts-ignore
      await hodler.connect(user).stake(user2.address, stake2);
      
      // Become voter - should emit total of both stakes
      await expect(
        // @ts-ignore
        hodler.connect(user).becomeVoter()
      ).to.emit(hodler, "AddedVotes")
        .withArgs(user.address, stake1 + stake2);
      
      // Add more stake - should emit only new amount
      await expect(
        // @ts-ignore
        hodler.connect(user).stake(operator.address, stake3)
      ).to.emit(hodler, "AddedVotes")
        .withArgs(user.address, stake3);
    });
  });
});