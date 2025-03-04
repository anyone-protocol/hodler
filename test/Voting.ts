import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Hodler Voting Tests", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let controller: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  
  const LOCK_SIZE = ethers.parseEther("100");
  const ONE_DAY = 24 * 60 * 60;
  const LOCK_DURATION = ONE_DAY * 7;
  const STAKE_DURATION = ONE_DAY * 14;
  const GOVERNANCE_DURATION = ONE_DAY * 30;

  beforeEach(async function () {
    [owner, user, controller, rewardsPool] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18))
    
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

    // Transfer tokens to user
    await token.transfer(user.address, ethers.parseEther("10000"));
    // @ts-ignore
    await token.connect(user).approve(await hodler.getAddress(), ethers.MaxUint256);
  });

  describe("Voting Tests", function () {
    it("Should add votes correctly", async function () {
      const voteAmount = ethers.parseEther("100");
      // @ts-ignore
      await hodler.connect(user).addVotes(voteAmount);

      const userData = await hodler.hodlers(user.address);
      expect(userData.votes).to.equal(voteAmount);
    });

    it("Should use available balance first when voting", async function () {
      // @ts-ignore
      await hodler.connect(user).lock("test-fingerprint");
      // @ts-ignore
      await hodler.connect(user).unlock("test-fingerprint");
      
      await time.increase(2 * LOCK_DURATION);

      // @ts-ignore
      await hodler.connect(user).openExpired()

      // @ts-ignore
      const balanceBefore = await token.balanceOf(user.address);
      // @ts-ignore
      await hodler.connect(user).addVotes(LOCK_SIZE);
      
      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter).to.equal(balanceBefore);
    });

    it("Should transfer tokens when available balance insufficient", async function () {
      const voteAmount = ethers.parseEther("100");
      const balanceBefore = await token.balanceOf(user.address);
      // @ts-ignore
      await hodler.connect(user).addVotes(voteAmount);
      
      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter).to.equal(balanceBefore - voteAmount);
    });

    it("Should remove votes correctly", async function () {
      const voteAmount = ethers.parseEther("100");
      // @ts-ignore
      await hodler.connect(user).addVotes(voteAmount);
      
      const removeAmount = ethers.parseEther("50");
      // @ts-ignore
      await hodler.connect(user).removeVotes(removeAmount);

      const userData = await hodler.hodlers(user.address);
      expect(userData.votes).to.equal(voteAmount - removeAmount);
    });

    it("Should fail removing more votes than available", async function () {
      const voteAmount = ethers.parseEther("100");
      // @ts-ignore
      await hodler.connect(user).addVotes(voteAmount);
      
      const removeAmount = ethers.parseEther("150");
      await expect(
        // @ts-ignore
        hodler.connect(user).removeVotes(removeAmount)
      ).to.be.revertedWith("Insufficient votes");
    });

    it("Should create vault entry after removing votes", async function () {
      const voteAmount = ethers.parseEther("100");
      // @ts-ignore
      await hodler.connect(user).addVotes(voteAmount);
      
      const removeAmount = ethers.parseEther("50");
      // @ts-ignore
      await hodler.connect(user).removeVotes(removeAmount);

      // @ts-ignore
      const vaults = await hodler.connect(user).getVaults(user.address);

      const lastVault = vaults[vaults.length - 1];
      expect(lastVault.amount).to.equal(removeAmount);
      expect(lastVault.availableAt).to.be.gt(0);
    });
  });
});