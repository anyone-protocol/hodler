import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("SnapshotVotingPower", function () {
  it("returns Hodler votes plus locked tokens", async function () {
    const [owner, user, controller, rewardsPool, operator] =
      await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    const token: any = await Token.deploy(
      ethers.parseEther("100000000")
    );
    await token.waitForDeployment();

    const lockSize = ethers.parseEther("100");
    const oneDay = 24 * 60 * 60;

    const HodlerV5 = await ethers.getContractFactory("HodlerV5");
    const hodler: any = await upgrades.deployProxy(HodlerV5, [
      await token.getAddress(),
      controller.address,
      lockSize,
      oneDay * 7,
      ethers.parseEther("1"),
      oneDay * 14,
      oneDay * 30,
      rewardsPool.address,
      ethers.parseEther("0.0001"),
    ]);
    await hodler.waitForDeployment();

    const SnapshotVotingPower =
      await ethers.getContractFactory("SnapshotVotingPower");

    const wrapper: any = await SnapshotVotingPower.deploy(
      await hodler.getAddress()
    );
    await wrapper.waitForDeployment();

    await token.transfer(
      user.address,
      ethers.parseEther("1000")
    );

    await token
      .connect(user)
      .approve(await hodler.getAddress(), ethers.MaxUint256);

    await hodler
      .connect(user)
      .stake(operator.address, ethers.parseEther("50"));

    await hodler.connect(user).becomeVoter();

    await hodler
      .connect(user)
      .lock("relay-1", operator.address);

    expect(await hodler.votesOf(user.address)).to.equal(
      ethers.parseEther("50")
    );

    expect(await wrapper.votesOf(user.address)).to.equal(
      ethers.parseEther("150")
    );
  });
});