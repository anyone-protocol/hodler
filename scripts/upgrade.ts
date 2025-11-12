import 'dotenv/config'
import { ethers, upgrades } from 'hardhat'
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

  console.log(`Upgrading Hodler proxy at ${proxyAddress} to HodlerV3...`)

  const upgraderPrivateKey = process.env.HODLER_UPGRADER_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // HH #1
  const [ owner ] = await ethers.getSigners()

  const upgrader = upgraderPrivateKey
    ? new ethers.Wallet(
        upgraderPrivateKey,
        new ethers.JsonRpcProvider(process.env.JSON_RPC)
      )
    : owner
  
  console.log(`Upgrading with upgrader address ${upgrader.address}...`)
  
  // Get the current implementation factory first
  const HodlerFactory = await ethers.getContractFactory('Hodler', upgrader)
  console.log('Importing existing proxy (V1) to manifest...')
  await upgrades.forceImport(proxyAddress, HodlerFactory)
  
  // Now prepare the new implementation
  const HodlerV3Factory = await ethers.getContractFactory('HodlerV3', upgrader)
  console.log('Performing upgrade to V3...')
  const upgradedProxy = await upgrades.upgradeProxy(proxyAddress, HodlerV3Factory)
  await upgradedProxy.waitForDeployment()
  
  const upgradedAddress = await upgradedProxy.getAddress()
  console.log(`Hodler proxy upgraded successfully at ${upgradedAddress}`)
  
  // Verify the version
  const version = await upgradedProxy.version()
  console.log(`New contract version: ${version}`)
  
  if (version !== 3) {
    throw new Error(`Expected version 3, but got version ${version}`)
  }

  console.log('Upgrade completed successfully!')
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
