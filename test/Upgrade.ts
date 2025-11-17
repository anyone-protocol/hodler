import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HodlerV5 Upgrade Tests", function () {
  let hodler: Contract;
  let hodlerV2: Contract;
  let hodlerV3: Contract;
  let hodlerV4: Contract;
  let hodlerV5: Contract;
  let hodlerV6: Contract;
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
    minStakeSize: ethers.parseEther("1"),
    stakeDuration: 7 * 24 * 60 * 60, // 1 week
    governanceDuration: 30 * 24 * 60 * 60, // 30 days
    defaultRedeemCost: ethers.parseEther("0.0001")
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
      INITIAL_PARAMS.minStakeSize,
      INITIAL_PARAMS.stakeDuration,
      INITIAL_PARAMS.governanceDuration,
      rewardsPool.address,
      INITIAL_PARAMS.defaultRedeemCost
    ], { kind: "uups" });
    await hodler.waitForDeployment();

    const HodlerV3Factory = await ethers.getContractFactory("HodlerV3");
    hodlerV3 = await upgrades.deployProxy(HodlerV3Factory, [
      await token.getAddress(),
      controller.address,
      INITIAL_PARAMS.lockSize,
      INITIAL_PARAMS.lockDuration,
      INITIAL_PARAMS.minStakeSize,
      INITIAL_PARAMS.stakeDuration,
      INITIAL_PARAMS.governanceDuration,
      rewardsPool.address,
      INITIAL_PARAMS.defaultRedeemCost
    ], { kind: "uups" });
    await hodlerV3.waitForDeployment();

    const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
    hodlerV5 = await upgrades.deployProxy(HodlerV5Factory, [
      await token.getAddress(),
      controller.address,
      INITIAL_PARAMS.lockSize,
      INITIAL_PARAMS.lockDuration,
      INITIAL_PARAMS.minStakeSize,
      INITIAL_PARAMS.stakeDuration,
      INITIAL_PARAMS.governanceDuration,
      rewardsPool.address,
      INITIAL_PARAMS.defaultRedeemCost
    ], { kind: "uups" });
    await hodlerV5.waitForDeployment();
  });

  describe("Upgrade 1->2 Tests", function () {
    it("Should allow upgrade to higher version", async function () {
      // Deploy HodlerV2 with higher version
      const HodlerV2Factory = await ethers.getContractFactory("HodlerV2Mock");
      hodlerV2 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV2Factory);
      
      expect(await hodlerV2.version()).to.be.equal(2); // Assuming V2 has VERSION = 2
      expect(await hodlerV2.address).to.equal(hodler.address);
    });

    it("Should prevent upgrade to same/lower version", async function () {
      // Deploy another instance of V1
      const HodlerFactory = await ethers.getContractFactory("Hodler");
      
      await expect(
        upgrades.upgradeProxy(await hodler.getAddress(), HodlerFactory)
      ).to.be.revertedWith("New implementation version must be greater than current version");
    });

    it("V2 Should maintain state after upgrade", async function () {
      
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

    it("V1 Should verify upgrade authorization", async function () {
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

  describe("Upgrade 1->3 Tests", function () {
    it("V1 Should allow upgrade to higher version", async function () {
      // Deploy HodlerV3 with higher version
      const HodlerV3Factory = await ethers.getContractFactory("HodlerV3");
      const upgradedHodlerV3 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV3Factory);
      
      expect(await upgradedHodlerV3.version()).to.be.equal(3);
      expect(await upgradedHodlerV3.getAddress()).to.equal(await hodler.getAddress());
    });

    it("V3 Should prevent upgrade to same/lower version", async function () {
      // Deploy another instance of V3
      const HodlerV3Factory = await ethers.getContractFactory("HodlerV3");
      
      await expect(
        upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV3Factory)
      ).to.be.revertedWith("New implementation version must be greater than current version");
    });

    it("V3 Should maintain state after upgrade", async function () {
      
      // @ts-ignore
      await token.connect(owner).transfer(user.address, INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await token.connect(user).approve(await hodler.getAddress(), INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await hodler.connect(user).lock("testFingerprint", user.address);

      const HodlerV3Factory = await ethers.getContractFactory("HodlerV3");
      const upgradedHodlerV3 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV3Factory);

      // @ts-ignore
      const lock = await upgradedHodlerV3.connect(user).getLock("testFingerprint", user.address);
      expect(lock).to.equal(INITIAL_PARAMS.lockSize);
      expect(await upgradedHodlerV3.LOCK_SIZE()).to.equal(INITIAL_PARAMS.lockSize);
      expect(await upgradedHodlerV3.tokenContract()).to.equal(await token.getAddress());
    });

    it("V1 Should verify upgrade authorization", async function () {
      const HodlerV3Factory = await ethers.getContractFactory("HodlerV3");
      
      // Try to upgrade from non-upgrader account
      await expect(
        upgrades.upgradeProxy(await hodler.getAddress(), HodlerV3Factory.connect(user))
      ).to.be.revertedWith(/AccessControl/);

      // Grant upgrader role and try again
      await hodler.grantRole(UPGRADER_ROLE, user.address);
      const upgradedHodlerV3 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV3Factory.connect(user));
      
      expect(await upgradedHodlerV3.version()).to.be.equal(3);
    });
  });

  describe("Upgrade 3->4 Tests", function () {
    it("V3 Should allow upgrade to higher version", async function () {
      // Deploy HodlerV4 with higher version
      const HodlerV4Factory = await ethers.getContractFactory("HodlerV4Mock");
      hodlerV4 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV4Factory);
      
      expect(await hodlerV4.version()).to.be.equal(4);
      expect(await hodlerV4.getAddress()).to.equal(await hodlerV3.getAddress());
    });

    it("V3 Should prevent upgrade to same/lower version", async function () {
      // Try to upgrade to V3 again (same version)
      const HodlerV3Factory = await ethers.getContractFactory("HodlerV3");
      
      await expect(
        upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV3Factory)
      ).to.be.revertedWith("New implementation version must be greater than current version");
    });

    it("V4 Should maintain state after upgrade", async function () {
      
      // @ts-ignore
      await token.connect(owner).transfer(user.address, INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await token.connect(user).approve(await hodlerV3.getAddress(), INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await hodlerV3.connect(user).lock("testFingerprint", user.address);

      const HodlerV4Factory = await ethers.getContractFactory("HodlerV4Mock");
      hodlerV4 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV4Factory);

      // @ts-ignore
      const lock = await hodlerV4.connect(user).getLock("testFingerprint", user.address);
      expect(lock).to.equal(INITIAL_PARAMS.lockSize);
      expect(await hodlerV4.LOCK_SIZE()).to.equal(INITIAL_PARAMS.lockSize);
      expect(await hodlerV4.tokenContract()).to.equal(await token.getAddress());
    });

    it("V3 Should verify upgrade authorization", async function () {
      const HodlerV4Factory = await ethers.getContractFactory("HodlerV4Mock");
      
      // Try to upgrade from non-upgrader account
      await expect(
        upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV4Factory.connect(user))
      ).to.be.revertedWith(/AccessControl/);

      // Grant upgrader role and try again
      await hodlerV3.grantRole(UPGRADER_ROLE, user.address);
      hodlerV4 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV4Factory.connect(user));
      
      expect(await hodlerV4.version()).to.be.equal(4);
    });
  });

  describe("Upgrade 3->5 Tests", function () {
    it("V3 Should allow upgrade to higher version", async function () {
      // Deploy HodlerV5 with higher version
      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      const upgradedHodlerV5 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV5Factory);
      
      expect(await upgradedHodlerV5.version()).to.be.equal(5);
      expect(await upgradedHodlerV5.getAddress()).to.equal(await hodlerV3.getAddress());
    });

    it("V5 Should prevent upgrade to same/lower version", async function () {
      // Deploy another instance of V5
      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      
      await expect(
        upgrades.upgradeProxy(await hodlerV5.getAddress(), HodlerV5Factory)
      ).to.be.revertedWith("New implementation version must be greater than current version");
    });

    it("V5 Should maintain state after upgrade", async function () {
      
      // @ts-ignore
      await token.connect(owner).transfer(user.address, INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await token.connect(user).approve(await hodlerV3.getAddress(), INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await hodlerV3.connect(user).lock("testFingerprint", user.address);

      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      const upgradedHodlerV5 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV5Factory);

      // @ts-ignore
      const lock = await upgradedHodlerV5.connect(user).getLock("testFingerprint", user.address);
      expect(lock).to.equal(INITIAL_PARAMS.lockSize);
      expect(await upgradedHodlerV5.LOCK_SIZE()).to.equal(INITIAL_PARAMS.lockSize);
      expect(await upgradedHodlerV5.tokenContract()).to.equal(await token.getAddress());
    });

    it("V3 Should verify upgrade authorization", async function () {
      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      
      // Try to upgrade from non-upgrader account
      await expect(
        upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV5Factory.connect(user))
      ).to.be.revertedWith(/AccessControl/);

      // Grant upgrader role and try again
      await hodlerV3.grantRole(UPGRADER_ROLE, user.address);
      const upgradedHodlerV5 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV5Factory.connect(user));
      
      expect(await upgradedHodlerV5.version()).to.be.equal(5);
    });
  });

  describe("Upgrade 5->6 Tests", function () {
    it("V5 Should allow upgrade to higher version", async function () {
      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      hodlerV5 = await upgrades.upgradeProxy(await hodlerV3.getAddress(), HodlerV5Factory);
      
      expect(await hodlerV5.version()).to.be.equal(5);
      expect(await hodlerV5.getAddress()).to.equal(await hodlerV3.getAddress());
    });

    it("V5 Should prevent upgrade to same/lower version", async function () {
      // Try to upgrade to V3 again (same version)
      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      
      await expect(
        upgrades.upgradeProxy(await hodlerV5.getAddress(), HodlerV5Factory)
      ).to.be.revertedWith("New implementation version must be greater than current version");
    });

    it("V6 Should maintain state after upgrade", async function () {
      
      // @ts-ignore
      await token.connect(owner).transfer(user.address, INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await token.connect(user).approve(await hodlerV5.getAddress(), INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await hodlerV5.connect(user).lock("testFingerprint", user.address);

      const HodlerV6Factory = await ethers.getContractFactory("HodlerV6Mock");
      hodlerV6 = await upgrades.upgradeProxy(await hodlerV5.getAddress(), HodlerV6Factory);

      // @ts-ignore
      const lock = await hodlerV6.connect(user).getLock("testFingerprint", user.address);
      expect(lock).to.equal(INITIAL_PARAMS.lockSize);
      expect(await hodlerV6.LOCK_SIZE()).to.equal(INITIAL_PARAMS.lockSize);
      expect(await hodlerV6.tokenContract()).to.equal(await token.getAddress());
    });

    it("V5 Should verify upgrade authorization", async function () {
      const HodlerV6Factory = await ethers.getContractFactory("HodlerV6Mock");
      
      // Try to upgrade from non-upgrader account
      await expect(
        upgrades.upgradeProxy(await hodlerV5.getAddress(), HodlerV6Factory.connect(user))
      ).to.be.revertedWith(/AccessControl/);

      // Grant upgrader role and try again
      await hodlerV5.grantRole(UPGRADER_ROLE, user.address);
      hodlerV6 = await upgrades.upgradeProxy(await hodlerV5.getAddress(), HodlerV6Factory.connect(user));
      
      expect(await hodlerV6.version()).to.be.equal(6);
    });

  });

  describe("Upgrade 1->5 Tests", function () {
    it("V1 Should allow upgrade to V5 version", async function () {
      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      hodlerV5 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV5Factory);
      
      expect(await hodlerV5.version()).to.be.equal(5);
      expect(await hodlerV5.getAddress()).to.equal(await hodler.getAddress());
    });

    it("V5 Should maintain state after upgrade from V1", async function () {
      
      // @ts-ignore
      await token.connect(owner).transfer(user.address, INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await token.connect(user).approve(await hodler.getAddress(), INITIAL_PARAMS.lockSize);
      // @ts-ignore
      await hodler.connect(user).lock("testFingerprint", user.address);

      const HodlerV5Factory = await ethers.getContractFactory("HodlerV5");
      const upgradedHodlerV5 = await upgrades.upgradeProxy(await hodler.getAddress(), HodlerV5Factory);

      // @ts-ignore
      const lock = await upgradedHodlerV5.connect(user).getLock("testFingerprint", user.address);
      expect(lock).to.equal(INITIAL_PARAMS.lockSize);
      expect(await upgradedHodlerV5.LOCK_SIZE()).to.equal(INITIAL_PARAMS.lockSize);
      expect(await upgradedHodlerV5.tokenContract()).to.equal(await token.getAddress());
    });
    
  });
});