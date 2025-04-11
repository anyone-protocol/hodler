import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Hodler Upgrade Tests", function () {
  let hodler: Contract;
  let hodlerV2: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let controller: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardsPool: SignerWithAddress;
  
  const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
  const CONTROLLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CONTROLLER_ROLE"));
  
  const INITIAL_PARAMS = {
    lockSize: ethers.parseEther("100"),
    lockDuration: 2 * 24 * 60 * 60, // 2 days
    stakeDuration: 7 * 24 * 60 * 60, // 1 week
    governanceDuration: 30 * 24 * 60 * 60 // 30 days
  };

  beforeEach(async function () {
    [owner, controller, user, rewardsPool] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));
    
    const HodlerFactory = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(HodlerFactory, [
      await token.getAddress(),
      controller.address,
      INITIAL_PARAMS.lockSize,
      INITIAL_PARAMS.lockDuration,
      INITIAL_PARAMS.stakeDuration,
      INITIAL_PARAMS.governanceDuration,
      rewardsPool.address
    ], { kind: "uups" });
    await hodler.waitForDeployment();
  });

  describe("Upgrade Tests", function () {
    it("Should allow upgrade to higher version", async function () {
      // Deploy HodlerV2 with higher version
      const HodlerV2Factory = await ethers.getContractFactory("HodlerV2Mock");
      hodlerV2 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV2Factory);
      
      expect(await hodlerV2.version()).to.be.equal(2); // Assuming V2 has VERSION = 2
      expect(await hodlerV2.address).to.equal(hodler.address);
    });

    it("Should prevent upgrade to same/lower version", async function () {
      // Deploy another instance of V1
      const HodlerV1Factory = await ethers.getContractFactory("Hodler");
      
      await expect(
        upgrades.upgradeProxy(await hodler.getAddress(), HodlerV1Factory)
      ).to.be.revertedWith("New implementation version must be greater than current version");
    });

    it("Should maintain state after upgrade", async function () {
      
      // @ts-ignore
      await token.connect(owner).transfer(user.address, INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await token.connect(user).approve(await hodler.getAddress(), INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await hodler.connect(user).lock("testFingerprint", user.address);

      const HodlerV2Factory = await ethers.getContractFactory("HodlerV2Mock");
      hodlerV2 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV2Factory);

      // @ts-ignore
      const lock = await hodlerV2.connect(user).getLock("testFingerprint", user.address);
      expect(lock).to.equal(INITIAL_PARAMS.lockSize);
      expect(await hodlerV2.LOCK_SIZE()).to.equal(INITIAL_PARAMS.lockSize);
      expect(await hodlerV2.tokenContract()).to.equal(await token.getAddress());
    });

    it("Should verify upgrade authorization", async function () {
      const HodlerV2Factory = await ethers.getContractFactory("HodlerV2Mock");
      
      // Try to upgrade from non-upgrader account
      await expect(
        upgrades.upgradeProxy(await hodler.getAddress(), HodlerV2Factory.connect(user))
      ).to.be.revertedWith(/AccessControl/);

      // Grant upgrader role and try again
      await hodler.grantRole(UPGRADER_ROLE, user.address);
      hodlerV2 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV2Factory.connect(user));
      
      expect(await hodlerV2.version()).to.be.equal(2);
    });
  });
});