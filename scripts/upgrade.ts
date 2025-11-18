import 'dotenv/config'
import { ethers, upgrades } from 'hardhat'
import Consul from 'consul'

async function main() {
  let consul
  const consulToken = process.env.CONSUL_TOKEN || undefined
  const oldFactoryName = process.env.HODLER_OLD_FACTORY_NAME || 'HodlerV3'
  const newFactoryName = process.env.HODLER_NEW_FACTORY_NAME || 'HodlerV5'
  const newVersion = parseInt(newFactoryName.split('V')[1]) || 1
  
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

  console.log(`Upgrading Hodler proxy at ${proxyAddress} to HodlerV3...`)

  const upgraderPrivateKey = process.env.HODLER_UPGRADER_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // HH #1
  const [ owner ] = await ethers.getSigners()

  console.log(`Connecting to JSON RPC: ${process.env.JSON_RPC}...`)
  const provider = new ethers.JsonRpcProvider(
    process.env.JSON_RPC,
    undefined,
    { staticNetwork: true, batchMaxCount: 1 }
  )

  const upgrader = upgraderPrivateKey
    ? new ethers.Wallet(upgraderPrivateKey, provider)
    : owner
  
  console.log(`Upgrading with upgrader address ${upgrader.address}...`)
  
  // Get the current implementation factory first
  const OldHodlerFactory = await ethers.getContractFactory(oldFactoryName, upgrader)
  console.log(`Importing existing proxy ${oldFactoryName} to manifest...`)
  await upgrades.forceImport(proxyAddress, OldHodlerFactory, { kind: 'uups' })
  
  // Now prepare the new implementation
  const NewHodlerFactory = await ethers.getContractFactory(newFactoryName, upgrader)
  console.log(`Performing upgrade to ${newFactoryName}...`)
  const upgradedProxy = await upgrades.upgradeProxy(proxyAddress, NewHodlerFactory, {
    kind: 'uups',
    timeout: 0 // Disable timeout for upgrade transaction
  })
  await upgradedProxy.waitForDeployment()
  
  const upgradedAddress = await upgradedProxy.getAddress()
  console.log(`Hodler proxy upgraded successfully at ${upgradedAddress}`)
  
  // Verify the version
  const version = await upgradedProxy.version()
  console.log(`New contract version: ${version}, expected: ${newVersion}`)
  
  if (version !== newVersion) {
    console.log('------ NOTICE ------')
    console.log(`Old cache? Expected version ${newVersion} of ${newFactoryName}, but got version ${version}?`)
    console.log(`Use checkVersion script to validate: npx hardhat --network sepolia run scripts/checkVersion.ts`)
    console.log('------ ^^^^^^ ------')
  }

  console.log('Upgrade completed!')
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
