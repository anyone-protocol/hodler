# Hodler Contract - ANyONe Protocol

A smart contract implementing token rewards, locking, staking, and governance mechanisms using the UUPS upgradeable pattern with role-based access control.
Contains tokens vaulted towards a specific protocol pre-defined purpose:

* Locking tokens on behalf of virtual relays (with a 30 day withdrawal delay);
* Staking tokens by hodlers to increase the scoring of relay operators (with a 7 day withdrawal delay);
* Staking tokens by hodlers to acquire governance voting capabilities (with a 30 day withdrawal delay);

The contract acts as a public registry assigned to specific addreses, and therefore doesn't emit ERC20 tokens.

## Overview

The Hodler contract is a core component of the ANyONe Protocol that manages token interactions including:
- Token locking with relay fingerprints
- Staking with operators
- Governance voting
- Rewards distribution
- Time-locked vaults

## Features

- **Upgradeable**: Uses OpenZeppelin's UUPS pattern
- **Access Control**: Role-based permissions for administrative functions
- **Security**: Implements reentrancy protection and pausable functionality
- **Time-Locked Operations**: Configurable durations for locks, stakes, and governance
- **Gas Management**: Built-in gas accounting for reward distributions

## Roles

- `DEFAULT_ADMIN_ROLE`: Full administrative access
- `PAUSER_ROLE`: Can pause/unpause contract
- `UPGRADER_ROLE`: Can upgrade contract implementation
- `CONTROLLER_ROLE`: Can manage rewards and protocol parameters

## Key Functions

### Token Operations
- `lock(string fingerprint)`: Lock tokens with a relay fingerprint
- `unlock(string fingerprint)`: Unlock tokens to a time-locked vault
- `stake(address operator, uint256 amount)`: Stake tokens with an operator
- `unstake(address operator)`: Unstake tokens to a time-locked vault
- `addVotes(uint256 amount)`: Lock tokens for governance
- `removeVotes(uint256 amount)`: Remove tokens from governance into a time-locked vault

### Vault Management
- `openExpired()`: Claim tokens from expired vaults
- `withdraw(uint256 amount)`: Withdraw available tokens

### Administrative Functions
- `setLockSize(uint256 size)`
- `setLockDuration(uint256 seconds)`
- `setStakeDuration(uint256 seconds)`
- `setGovernanceDuration(uint256 seconds)`
- `emergencyWithdraw()`: Admin-only emergency withdrawal

## Security Features

- Reentrancy protection
- Pausable functionality
- Role-based access control
- Time buffer protection against miner manipulation
- Version control for upgrades
- Emergency withdrawal mechanism

## Events

- `Locked/Unlocked`: Token locking operations
- `Staked/Unstaked`: Staking operations
- `AddedVotes/RemovedVotes`: Governance operations
- `Vaulted`: Time-locked vault creation
- `UpdateRewards/Rewarded`: Reward distribution
- `Withdrawn`: Token withdrawals
- Various parameter update events
## Development

Built on top of the [OpenZeppelin framework](https://openzeppelin.com/), developed using [HardHat env](https://hardhat.org/).

### Setup
```bash
npm i
npx hardhat test --network localhost
```

### Deploy contract to local dev env
```bash
$ npx hardhat run --network localhost scripts/deploy.ts
```