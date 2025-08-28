// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IHodler {
    function version() external pure returns (uint8);
}

/// @title Hodler - ANyONe Protocol
/// @notice Interfaces token: rewards, locking, staking, and governance
/// @dev UUPS upgradeable pattern with role-based access control
contract Hodler is
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using Strings for address;
    using SafeMath for uint256;
    using SafeCast for uint256;
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    
    uint8 public constant VERSION = 1;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

    IERC20 public tokenContract;
    address payable public controllerAddress;
    address public rewardsPoolAddress;

    uint256 public LOCK_SIZE;
    uint64 public LOCK_DURATION; 
    uint64 public STAKE_DURATION;
    uint64 public GOVERNANCE_DURATION;

    uint64 private constant MINUTE = 60;
    uint64 private constant HOUR = 60 * MINUTE;
    uint64 private constant DAY = 24 * HOUR;
    uint64 private constant WEEK = 7 * DAY;
    uint64 private constant MONTH = 30 * DAY;
    
    uint64 private constant TIMESTAMP_BUFFER = 1 * HOUR;

    struct VaultData {
        uint256 amount;
        uint64 availableAt;
        uint8 kind;
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
    
    event Locked(address indexed hodler, string fingerprint, uint256 amount, address operator);
    event Unlocked(address indexed hodler, string fingerprint, uint256 amount, address operator);

    event Staked(address indexed hodler, address indexed operator, uint256 amount);
    event Unstaked(address indexed hodler, address indexed operator, uint256 amount);

    event AddedVotes(address indexed hodler, uint256 amount);
    event RemovedVotes(address indexed hodler, uint256 amount);
    
    event Vaulted(address indexed hodler, uint256 amount, uint256 availableAt);
    
    event UpdateRewards(address indexed hodler, uint256 gasEstimate, bool redeem);
    event Rewarded(address indexed hodler, uint256 amount, bool redeemed, uint256 relayRewardAmount, uint256 stakingRewardAmount);
    
    event Withdrawn(address indexed hodler, uint256 amount);
    
    event LockSizeUpdated(address indexed controller, uint256 oldValue, uint256 newValue);
    event LockDurationUpdated(address indexed controller, uint256 oldValue, uint256 newValue);
    event StakeDurationUpdated(address indexed controller, uint256 oldValue, uint256 newValue);
    event GovernanceDurationUpdated(address indexed controller, uint256 oldValue, uint256 newValue);

    event HodlerInitialized(
        address tokenAddress,
        address controller,
        uint256 lockSize,
        uint64 lockDuration,
        uint64 stakeDuration,
        uint64 governanceDuration
    );

    function lock(string calldata fingerprint, address _operator) external whenNotPaused nonReentrant {
        uint256 fingerprintLength = bytes(fingerprint).length;
        require(fingerprintLength > 0, "Fingerprint must have non 0 characters");
        require(fingerprintLength <= 40, "Fingerprint must have 40 or less characters");
        
        if (hodlers[_msgSender()].available >= LOCK_SIZE) {
            hodlers[_msgSender()].available = hodlers[_msgSender()].available.sub(LOCK_SIZE);
        } else {
            require(tokenContract.transferFrom(_msgSender(), address(this), LOCK_SIZE), 
                    "Transfer of tokens for the lock failed");
        }

        if (hodlers[_msgSender()].isSet == false) {
            hodlerKeys.push(_msgSender());
            hodlers[_msgSender()].isSet = true;
        }

        hodlers[_msgSender()].locks.push(LockData(fingerprint, _operator, LOCK_SIZE));
        emit Locked(_msgSender(), fingerprint, LOCK_SIZE, _operator);
    }

    function unlock(string calldata fingerprint, address _operator) external whenNotPaused nonReentrant {        
        uint256 fingerprintLength = bytes(fingerprint).length;
        require(fingerprintLength > 0, "Fingerprint must have non 0 characters");
        require(fingerprintLength <= 40, "Fingerprint must have 40 or less characters");

        uint256 lockAmount = 0;
        string memory lockData;
        uint safeIndex = 0;
        bytes32 bytesFingerprint = keccak256(bytes(fingerprint));
        for (uint i = 0; i < hodlers[_msgSender()].locks.length; i++) {
            if (keccak256(bytes(hodlers[_msgSender()].locks[i].fingerprint)) == bytesFingerprint
                && hodlers[_msgSender()].locks[i].operator == _operator) {
                lockAmount = lockAmount.add(hodlers[_msgSender()].locks[i].amount);
                lockData = hodlers[_msgSender()].locks[i].fingerprint;
            } else {
                if (safeIndex != i) {
                    hodlers[_msgSender()].locks[safeIndex] = hodlers[_msgSender()].locks[i];
                }
                safeIndex++;
            }
        }

        require(lockAmount > 0, "No lock found for the fingerprint");
        
        while (hodlers[_msgSender()].locks.length > safeIndex) {
            hodlers[_msgSender()].locks.pop();
        }
        emit Unlocked(_msgSender(), fingerprint, lockAmount, _operator);

        uint64 availableAt = block.timestamp.add(LOCK_DURATION).toUint64();
        hodlers[_msgSender()].vaults.push(VaultData(lockAmount, availableAt, 1, lockData));
        emit Vaulted(_msgSender(), lockAmount, availableAt);
    }

    function stake(address _address, uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Insuficient amount for staking");
        if (hodlers[_msgSender()].available >= _amount) {
            hodlers[_msgSender()].available = hodlers[_msgSender()].available.sub(_amount);
        } else {
            if (hodlers[_msgSender()].isSet == false) {
                hodlerKeys.push(_msgSender());
                hodlers[_msgSender()].isSet = true;
            }

            require(tokenContract.transferFrom(_msgSender(), address(this), _amount), 
                    "Transfer of tokens for staking failed");
        }

        bool foundStake = false;
        uint index = 0;
        while (foundStake == false && index < hodlers[_msgSender()].stakes.length) {
            if (hodlers[_msgSender()].stakes[index].operator == _address) {
                hodlers[_msgSender()].stakes[index].amount = hodlers[_msgSender()].stakes[index].amount.add(_amount);
                foundStake = true;
            } else {
                index++;
            }
        }
        if (foundStake == false) {
            hodlers[_msgSender()].stakes.push(StakeData(_address, _amount));
        }

        emit Staked(_msgSender(), _address, _amount);
    }

    function unstake(address _address, uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Insufficient amount for unstaking");
        uint safeIndex = 0;
        bool didUnstake = false;
        address stakeData;
        for (uint i = 0; i < hodlers[_msgSender()].stakes.length; i++) {
            if (hodlers[_msgSender()].stakes[i].operator == _address) {
                require(hodlers[_msgSender()].stakes[i].amount >= _amount, "Insufficient stake");
                uint256 oldStake = hodlers[_msgSender()].stakes[i].amount;
                hodlers[_msgSender()].stakes[i].amount = hodlers[_msgSender()].stakes[i].amount.sub(_amount);
                stakeData = hodlers[_msgSender()].stakes[i].operator;
                didUnstake = true;
                if (oldStake > _amount) {
                    safeIndex++;
                }
            } else {
                if (safeIndex != i) {
                    hodlers[_msgSender()].stakes[safeIndex] = hodlers[_msgSender()].stakes[i];
                }
                safeIndex++;
            }
        }

        require(didUnstake == true, "No stake found for the operator address");

        while (hodlers[_msgSender()].stakes.length > safeIndex) {
            hodlers[_msgSender()].stakes.pop();
        }

        emit Unstaked(_msgSender(), _address, _amount);
        uint64 availableAt = block.timestamp.add(STAKE_DURATION).toUint64();
        hodlers[_msgSender()].vaults.push(VaultData(_amount, availableAt, 2, stakeData.toHexString()));
        emit Vaulted(_msgSender(), _amount, availableAt);
    }

    function addVotes(uint256 _amount) external whenNotPaused nonReentrant {
        if (hodlers[_msgSender()].available >= _amount) {
            hodlers[_msgSender()].available = hodlers[_msgSender()].available.sub(_amount);
        } else {
            if (hodlers[_msgSender()].isSet == false) {
                hodlerKeys.push(_msgSender());
                hodlers[_msgSender()].isSet = true;
            }
            require(tokenContract.transferFrom(_msgSender(), address(this), _amount), 
                    "Transfer of tokens for voting failed");
        }
        hodlers[_msgSender()].votes = hodlers[_msgSender()].votes.add(_amount);
        emit AddedVotes(_msgSender(), _amount);
    }

    function removeVotes(uint256 _amount) external whenNotPaused nonReentrant {
        require(hodlers[_msgSender()].votes >= _amount, "Insufficient votes");
        hodlers[_msgSender()].votes = hodlers[_msgSender()].votes.sub(_amount);
        emit RemovedVotes(_msgSender(), _amount);

        uint64 availableAt = block.timestamp.add(GOVERNANCE_DURATION).toUint64();
        hodlers[_msgSender()].vaults.push(VaultData(_amount, availableAt, 3, ''));

        emit Vaulted(_msgSender(), _amount, availableAt);
    }

    receive() external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Must send ETH");

        if (hodlers[_msgSender()].isSet == false) {
            hodlerKeys.push(_msgSender());
            hodlers[_msgSender()].isSet = true;
        }

        uint256 gasTest = gasleft();
        hodlers[_msgSender()].gas = hodlers[_msgSender()].gas.sub(0);
        hodlers[_msgSender()].available = hodlers[_msgSender()].available.add(0);
        require(hodlers[_msgSender()].gas >= 0, "Insufficient gas budget for hodler account");
        
        uint256 gasEstimate = gasTest.sub(gasleft()).mul(3);

        require(
            hodlers[_msgSender()].gas.add(msg.value) > gasEstimate,
            "Not enough gas budget for updating the hodler account"
        );

        hodlers[_msgSender()].gas = hodlers[_msgSender()].gas.add(msg.value);
        
        emit UpdateRewards(_msgSender(), gasEstimate, false);
                
        (bool sent, ) = controllerAddress.call{value: msg.value}("");
        require(sent, "Failed to send ETH to controller");
    }

    function redeem() external whenNotPaused nonReentrant {
        require(hodlers[_msgSender()].isSet, "Hodler account not found");

        uint256 gasTest = gasleft();
        hodlers[_msgSender()].gas = hodlers[_msgSender()].gas.sub(0);
        hodlers[_msgSender()].available = hodlers[_msgSender()].available.add(0);
        require(hodlers[_msgSender()].gas >= 0, "Insufficient gas budget for hodler account");
        
        uint256 gasEstimate = gasTest.sub(gasleft()).mul(3);

        require(
            hodlers[_msgSender()].gas > gasEstimate,
            "Not enough gas budget for updating the hodler account"
        );

        emit UpdateRewards(_msgSender(), gasEstimate, true);
    }

    function openExpired() external whenNotPaused nonReentrant {
        uint64 bufferedTimestamp = block.timestamp.sub(TIMESTAMP_BUFFER).toUint64();
        uint256 safeIndex = 0;
        uint256 claimed = 0;
        for (uint256 i = 0; i < hodlers[_msgSender()].vaults.length; i++) {
            if (hodlers[_msgSender()].vaults[i].availableAt < bufferedTimestamp) {
                claimed = claimed.add(hodlers[_msgSender()].vaults[i].amount);
            } else {
                if (safeIndex != i) {
                    hodlers[_msgSender()].vaults[safeIndex] = hodlers[_msgSender()].vaults[i];
                }
                safeIndex++;
            }
        }

        while (hodlers[_msgSender()].vaults.length > safeIndex) {
            hodlers[_msgSender()].vaults.pop();
        }

        hodlers[_msgSender()].available = hodlers[_msgSender()].available.add(claimed);
    }

    function withdraw(uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Non-zero amount required");
        require(
            hodlers[_msgSender()].available >= _amount,
            "Insufficient available balance"
        );
        hodlers[_msgSender()].available = hodlers[_msgSender()].available.sub(_amount);
        tokenContract.transfer(_msgSender(), _amount);

        emit Withdrawn(_msgSender(), _amount);
    }

    function isValidDuration(uint256 _duration) internal pure returns (bool) {
        return _duration >= (TIMESTAMP_BUFFER + DAY);
    }
    
    function reward(
        address _address,
        uint256 _relayRewardAllocation,
        uint256 _stakingRewardAllocation,
        uint256 _gasEstimate,
        bool _redeem
    ) external onlyRole(CONTROLLER_ROLE) whenNotPaused nonReentrant {
        require(hodlers[_address].gas >= _gasEstimate, "Insufficient gas budget for hodler account");
        hodlers[_address].gas = hodlers[_address].gas.sub(_gasEstimate);

        uint256 relayRewardAmount = _relayRewardAllocation.sub(hodlers[_address].claimedRelayRewards);
        uint256 stakingRewardAmount = _stakingRewardAllocation.sub(hodlers[_address].claimedStakingRewards);
        uint256 rewardAmount = relayRewardAmount.add(stakingRewardAmount);
        require(rewardAmount > 0, "No rewards to claim");
        
        hodlers[_address].claimedRelayRewards = _relayRewardAllocation;
        hodlers[_address].claimedStakingRewards = _stakingRewardAllocation;

        if (_redeem) {
            require(tokenContract.transferFrom(rewardsPoolAddress, _address, rewardAmount), "Withdrawal of reward tokens failed");
        } else {
            require(tokenContract.transferFrom(rewardsPoolAddress, address(this), rewardAmount), "Transfer of reward tokens failed");
            hodlers[_address].available = hodlers[_address].available.add(rewardAmount);
        }
        emit Rewarded(_address, rewardAmount, _redeem, relayRewardAmount, stakingRewardAmount);
    }

    function getLock(string calldata _fingerprint, address _operator) external view returns (uint256) {
        uint256 fingerprintLength = bytes(_fingerprint).length;
        require(fingerprintLength > 0, "Fingerprint must have non 0 characters");
        require(fingerprintLength <= 40, "Fingerprint must have 40 or less characters");

        uint256 lockAmount = 0;
        bytes32 bytesFingerprint = keccak256(bytes(_fingerprint));
        for (uint i = 0; i < hodlers[_msgSender()].locks.length; i++) {
            if (keccak256(bytes(hodlers[_msgSender()].locks[i].fingerprint)) == bytesFingerprint
                && hodlers[_msgSender()].locks[i].operator == _operator) {
                
                lockAmount = lockAmount.add(hodlers[_msgSender()].locks[i].amount);
            }
        }

        return lockAmount;
    }

    function getStake(address _address) external view returns (uint256) {
        uint256 stakeAmount = 0;
        for (uint i = 0; i < hodlers[_msgSender()].stakes.length; i++) {
            if (hodlers[_msgSender()].stakes[i].operator == _address) {
                stakeAmount = stakeAmount.add(hodlers[_msgSender()].stakes[i].amount);
            }
        }
        return stakeAmount;
    }

    function getHodlerKeys() external view returns (address[] memory) {
        return hodlerKeys;
    }

    function getVaults(address _address) external view returns (VaultData[] memory) {
        return hodlers[_address].vaults;
    }

    function getLocks(address _address) external view returns (LockData[] memory) {
        return hodlers[_address].locks;
    }

    function getStakes(address _address) external view returns (StakeData[] memory) {
        return hodlers[_address].stakes;
    }

    function setLockSize(uint256 _size) external onlyRole(CONTROLLER_ROLE) nonReentrant {
        require(_size > 0, "Lock size must be greater than 0");
        uint256 oldValue = LOCK_SIZE;
        LOCK_SIZE = _size;
        emit LockSizeUpdated(controllerAddress, oldValue, _size);
    }

    function setLockDuration(uint64 _seconds) external onlyRole(CONTROLLER_ROLE) nonReentrant {
        require(isValidDuration(_seconds), "Invalid duration for locking");
        uint256 oldValue = LOCK_DURATION;
        LOCK_DURATION = _seconds;
        emit LockDurationUpdated(controllerAddress, oldValue, _seconds);
    }

    function setStakeDuration(uint64 _seconds) external onlyRole(CONTROLLER_ROLE) nonReentrant {
        require(isValidDuration(_seconds), "Invalid duration for staking");
        uint256 oldValue = STAKE_DURATION;
        STAKE_DURATION = _seconds;
        emit StakeDurationUpdated(controllerAddress, oldValue, _seconds);
    }

    function setGovernanceDuration(uint64 _seconds) external onlyRole(CONTROLLER_ROLE) nonReentrant {
        require(isValidDuration(_seconds), "Invalid duration for governance");
        uint256 oldValue = GOVERNANCE_DURATION;
        GOVERNANCE_DURATION = _seconds;
        emit GovernanceDurationUpdated(controllerAddress, oldValue, _seconds);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _tokenAddress, 
        address payable _controller,
        uint256 _lockSize,
        uint64 _lockDuration,
        uint64 _stakeDuration,
        uint64 _governanceDuration,
        address _rewardsPoolAddress
    ) initializer public {        
        require(_lockSize > 0, "Lock size must be greater than 0");
        require(isValidDuration(_lockDuration), "Invalid duration for locking");
        require(isValidDuration(_stakeDuration), "Invalid duration for staking");
        require(isValidDuration(_governanceDuration), "Invalid duration for governance");

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        tokenContract = IERC20(_tokenAddress);
        controllerAddress = _controller;

        LOCK_SIZE = _lockSize;
        LOCK_DURATION = _lockDuration;
        STAKE_DURATION = _stakeDuration;
        GOVERNANCE_DURATION = _governanceDuration;
        
        rewardsPoolAddress = _rewardsPoolAddress;

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(PAUSER_ROLE, _msgSender());
        _grantRole(UPGRADER_ROLE, _msgSender());
        _grantRole(CONTROLLER_ROLE, _controller);
        emit HodlerInitialized(_tokenAddress, _controller, _lockSize, _lockDuration, _stakeDuration, _governanceDuration);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        view
        onlyRole(UPGRADER_ROLE)
        override
    {
        require(
            _compareVersions(IHodler(newImplementation).version(), VERSION) > 0,
            "New implementation version must be greater than current version"
        );
    }

    function _compareVersions(uint8 version1, uint8 version2) internal pure returns (int) {
        if (version1 > version2) return 1;
        if (version1 < version2) return -1;

        return 0;
    }

    function version() external pure returns (uint8) {
        return VERSION;
    }

    function hasRole(bytes32 role, address account) public view override returns (bool) {
        return super.hasRole(role, account);
    }

    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(paused(), "Contract must be paused");
        uint256 balance = tokenContract.balanceOf(address(this));
        require(tokenContract.transfer(_msgSender(), balance), "Transfer failed");
    }
}