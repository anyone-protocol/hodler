import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("Hodler", function () {
  let hodler: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let operator: SignerWithAddress;

  beforeEach(async function () {
    [ owner, addr1, operator ] = await ethers.getSigners()

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy(100_000_000n * BigInt(1e18));

    const HodlerFactory = await ethers.getContractFactory("Hodler");
    hodler = await upgrades.deployProxy(
      HodlerFactory,
      [ token.getAddress(), operator.address ]
    )
    await hodler.waitForDeployment()
  });

  it("should initialize with correct values", async function () {
    expect(await hodler.token()).to.equal(token.getAddress());
    expect(await hodler.currentLockSize()).to.equal(ethers.parseEther("10"));
  });

  it("should lock tokens", async function () {
    // @ts-ignore
    await token.connect(owner).approve(hodler.address, ethers.parseEther("10"));
    (token.address, ethers.parseEther("10"));
    // @ts-ignore
    await hodler.connect(addr1).lock(addr1.address, "fingerprint1");

    // @ts-ignore
    const lock = await hodler.locks(addr1.address, "fingerprint1");
    expect(lock.amount).to.equal(ethers.parseEther("10"));
  });

  it("should emit Locked event", async function () {
    // @ts-ignore
    await token.connect(owner).approve(hodler.address, ethers.parseEther("10"));
    // @ts-ignore
    await expect(hodler.connect(addr1).lock(addr1.address, "fingerprint1"))
      .to.emit(hodler, "Locked")
      .withArgs(addr1.address, "fingerprint1", ethers.parseEther("10"));
  });
});