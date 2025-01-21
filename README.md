# Staker contract
`Staker` contract contains tokens vaulted towards a specific protocol pre-defined purpose:
* Locking tokens by operators of virtual relays (with a 30 day withdrawal delay);
* Locking tokens on behalf of operators of virtual relays (with a 30 day withdrawal delay);
* Staking tokens by hodlers to increase the scoring of relay operators (with a 7 day withdrawal delay);
* Staking tokens by hodlers to acquire governance voting capabilities (with a 30 day withdrawal delay);

The contract acts as a public registry assigned to specific addreses, and therefore doesn't emit ERC20 tokens.

## Functions for locking:
* `lock(address _address, string calldata fingerprint)` - will transfer `currentLockSize` atomic units of tokens to the vault, and lock it for the specified fingerprint. These tokens will be locked for `lockBlocks` amount of blocks. In case where the user has already vaulted tokens that are available, those will be used first.

* `unlock(address _address, uint256 _upto, string calldata fingerprint)` - will cancel the `_upto` amount of tokens locked with a specified fingerprint by a given address (given the `lockBlocks` amount have passed since locking those tokens). Cancelling the lock will make the tokens available for immediate withdrawal, locking, staking or delegating to vote.

## Functions for staking:
* `stake(address _address, uint256 _amount)` - will transfer `_amount` atomic units of tokens to the vault, and stake it as the sender towards the specified operator address.

* `unstake(address _address, uint256 _amount)` - will immediately cancel the sender's stake assigned to the given address and make the tokens available for immediate staking (changing to another operator address), but the withdrawal, locking, or delegating tokens to vote will be delayed by `stakeBlocks`.

* `restake(address _address, bool _enabled)` - will toggle automatic restaking of rewards for a given address. This moves the allocated rewards from being claimable to be staked (in the protocol layer) and automatically included in calculation of stake rewards.

* `updateStake()` - will make the controller process use the gas to update the amount of staked tokens in this contract.

## Functions for governance:
* `endorse(address _address, uint256 _amount)` - will transfer `_amount` atomic units of tokens to the vault and lock them for governance purposes.

* `repudiate(address _address, uint256 _amount)` - will immediately cancel `_amount` of locked tokens with the purpose of governance but they will be made available after a delay of `governanceBlocks`

## Interface for interactions with the staker contract's vault:
* `receive()` - sending coin to the contract, will make the controller process use it as gas to update the amount of allocated tokens in the rewards distribution. 
Freshly allocated reward tokens increase the amount of vaulted tokens for a given user and are available for immediate withdrawal, staking, or delegating to vote.

* `withdraw(uint256 _amount)` - if available, will withdraw specified amount of tokens from the contract's vault.

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