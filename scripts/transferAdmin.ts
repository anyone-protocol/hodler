import 'dotenv/config'
import { ethers } from 'hardhat'
import Consul from 'consul'

async function main() {
  let consul
  const consulToken = process.env.CONSUL_TOKEN || undefined
  let proxyAddress = process.env.HODLER_PROXY_ADDRESS

  if (process.env.PHASE !== undefined && process.env.CONSUL_IP !== undefined) {
    console.log(`Connecting to Consul at ${process.env.CONSUL_IP}:${process.env.CONSUL_PORT}...`)
    consul = new Consul({
      host: process.env.CONSUL_IP,
      port: process.env.CONSUL_PORT,
    });

    proxyAddress = (await consul.kv.get<{ Value: string }>({
      key: process.env.HODLER_CONSUL_KEY || 'dummy-path',
      token: consulToken
    })).Value
  }

  if (!proxyAddress) {
    throw new Error('Hodler proxy address not found. Set HODLER_PROXY_ADDRESS or configure Consul.')
  }

  const newAdminAddress = process.env.NEW_ADMIN_ADDRESS
  if (!newAdminAddress) {
    throw new Error('NEW_ADMIN_ADDRESS environment variable is required')
  }

  if (!ethers.isAddress(newAdminAddress)) {
    throw new Error(`Invalid Ethereum address: ${newAdminAddress}`)
  }

  console.log(`Connecting to Hodler proxy at ${proxyAddress}...`)
    
  const deployerPrivateKey = process.env.HODLER_DEPLOYER_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // HH #1
  const [ owner ] = await ethers.getSigners()

  const jsonRpc = process.env.JSON_RPC
  console.log(`Using JSON RPC: ${jsonRpc}`)
  const deployer = deployerPrivateKey
    ? new ethers.Wallet(
        deployerPrivateKey,
        new ethers.JsonRpcProvider(jsonRpc)
      )
    : owner
  
  console.log(`Current admin: ${deployer.address}`)
  console.log(`New admin: ${newAdminAddress}`)

  const hodler = await ethers.getContractAt('HodlerV5', proxyAddress, deployer)

  const DEFAULT_ADMIN_ROLE = await hodler.DEFAULT_ADMIN_ROLE()
  
  // Check if deployer has admin role
  const hasAdminRole = await hodler.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)
  if (!hasAdminRole) {
    throw new Error('Deployer does not have DEFAULT_ADMIN_ROLE')
  }

  // Check if new admin already has the role
  const newAdminHasRole = await hodler.hasRole(DEFAULT_ADMIN_ROLE, newAdminAddress)
  if (newAdminHasRole) {
    console.log('New admin already has DEFAULT_ADMIN_ROLE')
  } else {
    console.log('Granting DEFAULT_ADMIN_ROLE to new admin...')
    const grantTx = await hodler.grantRole(DEFAULT_ADMIN_ROLE, newAdminAddress)
    await grantTx.wait()
    console.log(`✓ Granted DEFAULT_ADMIN_ROLE to ${newAdminAddress}`)
    console.log(`  Transaction hash: ${grantTx.hash}`)
  }

  // Revoke admin role from current admin
  console.log('Revoking DEFAULT_ADMIN_ROLE from current admin...')
  const revokeTx = await hodler.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address)
  await revokeTx.wait()
  console.log(`✓ Revoked DEFAULT_ADMIN_ROLE from ${deployer.address}`)
  console.log(`  Transaction hash: ${revokeTx.hash}`)

  console.log('\n✓ Admin role transfer completed successfully!')
  console.log(`  Old admin: ${deployer.address}`)
  console.log(`  New admin: ${newAdminAddress}`)
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
