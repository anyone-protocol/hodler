// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IHodlerVotingPower {
    struct LockData {
        string fingerprint;
        address operator;
        uint256 amount;
    }

    function votesOf(address hodler) external view returns (uint256);

    function getLocks(address hodler)
        external
        view
        returns (LockData[] memory);
}

contract SnapshotVotingPower {
    IHodlerVotingPower public immutable hodlerContract;

    constructor(address _hodlerContract) {
        require(_hodlerContract != address(0), "Invalid Hodler address");
        hodlerContract = IHodlerVotingPower(_hodlerContract);
    }

    function votesOf(address hodler) external view returns (uint256) {
        uint256 votingPower = hodlerContract.votesOf(hodler);

        IHodlerVotingPower.LockData[] memory locks =
            hodlerContract.getLocks(hodler);

        for (uint256 i = 0; i < locks.length; i++) {
            votingPower += locks[i].amount;
        }

        return votingPower;
    }
}