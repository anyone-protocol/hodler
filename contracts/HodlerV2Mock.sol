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

    struct VaultData {
        uint256 amount;
        uint256 availableAt;
        uint kind;
        string data;
    }

    struct LockData {
        string fingerprint;
        address operator;
        uint256 amount;
    }

    struct StakeData {
        address operator;
        uint256 amount;
    }

    struct HodlerData {
        uint256 available;
        VaultData[] vaults;
        LockData[] locks;
        StakeData[] stakes;
        uint256 votes;
        uint256 gas;
        bool isSet;
        uint256 claimedRelayRewards;
        uint256 claimedStakingRewards;
    }
    
    mapping(address => HodlerData) public hodlers;
    address[] public hodlerKeys;

    function getLock(string calldata _fingerprint, address _operator) external view returns (uint256) {
        uint256 fingerprintLength = bytes(_fingerprint).length;
        require(fingerprintLength > 0, "Fingerprint must have non 0 characters");
        require(fingerprintLength <= 40, "Fingerprint must have 40 or less characters");

        uint256 lockAmount = 0;
        bytes32 bytesFingerprint = keccak256(bytes(_fingerprint));
        for (uint i = 0; i < hodlers[_msgSender()].locks.length; i++) {
            if (keccak256(bytes(hodlers[_msgSender()].locks[i].fingerprint)) == bytesFingerprint
                && hodlers[_msgSender()].locks[i].operator == _operator) {
                lockAmount = lockAmount + hodlers[_msgSender()].locks[i].amount;
            }
        }

        return lockAmount;
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

    function initialize(
        address _tokenContract,
        address payable _controllerAddress,
        address _rewardsPoolAddress,
        uint256 _lockSize,
        uint256 _lockDuration,
        uint256 _stakeDuration,
        uint256 _governanceDuration
    ) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        tokenContract = IERC20(_tokenContract);
        controllerAddress = _controllerAddress;
        rewardsPoolAddress = _rewardsPoolAddress;
        LOCK_SIZE = _lockSize;
        LOCK_DURATION = _lockDuration;
        STAKE_DURATION = _stakeDuration;
        GOVERNANCE_DURATION = _governanceDuration;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
}