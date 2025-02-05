// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../contracts/Hodler.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract HodlerV2Mock is 
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable {

    uint8 public constant VERSION = 2;

    IERC20 public tokenContract;
    address payable public controllerAddress;
    address public rewardsPoolAddress;

    uint256 public LOCK_SIZE;
    uint256 public LOCK_DURATION; 
    uint256 public STAKE_DURATION;
    uint256 public GOVERNANCE_DURATION;

    struct Vault {
        uint256 amount;
        uint256 availableAt;
    }

    struct HodlerData {
        uint256 available;
        Vault[] vaults;
        mapping(string => uint256) locks; // relay fingerprint => amount
        mapping(address => uint256) stakes; // operator address => amount
        uint256 votes;
        uint256 gas;
    }
    
    mapping(address => HodlerData) public hodlers;

    function getLock(string calldata _fingerprint) external view returns (uint256) {
        uint256 fingerprintLength = bytes(_fingerprint).length;
        require(fingerprintLength > 0, "Fingerprint must have non 0 characters");
        require(fingerprintLength <= 40, "Fingerprint must have 40 or less characters");

        return hodlers[_msgSender()].locks[_fingerprint];
    }

    // Add new functionality for V2
    function newFunction() external pure returns (string memory) {
        return "V2 Function";
    }

    function version() external pure returns (uint8) {
        return VERSION;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override {}
}