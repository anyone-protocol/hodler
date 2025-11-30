import 'dotenv/config'
import { ethers, upgrades } from 'hardhat'
import Consul from 'consul'

async function main() {
  let consul
  const consulToken = process.env.CONSUL_TOKEN || undefined
  let anyoneAddress = process.env.ATOR_TOKEN_CONTRACT_ADDRESS

  if (process.env.PHASE !== undefined && process.env.CONSUL_IP !== undefined) {
    console.log(`Connecting to Consul at ${process.env.CONSUL_IP}:${process.env.CONSUL_PORT}...`)
    consul = new Consul({
      host: process.env.CONSUL_IP,
      port: process.env.CONSUL_PORT,
    });

    anyoneAddress = (await consul.kv.get<{ Value: string }>({
      key: process.env.ATOR_TOKEN_CONSUL_KEY || 'dummy-path',
      token: consulToken
    })).Value
  }

  console.log(`Deploying hodler with ANyONe token: ${anyoneAddress}`)

  const deployerPrivateKey = process.env.HODLER_DEPLOYER_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // HH #1
  const [ owner ] = await ethers.getSigners()

  const deployer = deployerPrivateKey
    ? new ethers.Wallet(
        deployerPrivateKey,
        new ethers.JsonRpcProvider(process.env.JSON_RPC)
      )
    : owner
  
  const operatorAddress = process.env.HODLER_OPERATOR_ADDRESS || '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' // Hardhat #2 

  const rewardsPoolAddress = process.env.REWARDS_POOL_ADDRESS || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // HH #1

  console.log(`Deploying HodlerV3 with operator ${operatorAddress}...`)
  
  console.log(`Deploying HodlerV3 with deployer ${deployer.address}...`)
  
  const Contract = await ethers.getContractFactory('HodlerV5', deployer)

  const lockSize = '100'
  const lockDuration = 60 * 60 * 24 * 30 // 30 days
  const minStakeSize = '1'
  const stakeDuration = 60 * 60 * 24 * 7 // 7 days
  const governanceDuration = 60 * 60 * 24 * 30 // 30 days
  const defaultRedeemCost = '0.0001';
  
  const instance = await upgrades.deployProxy(
    Contract,
    [ anyoneAddress, operatorAddress, 
      ethers.parseEther(lockSize), lockDuration, 
      ethers.parseEther(minStakeSize), stakeDuration, 
      governanceDuration, 
      rewardsPoolAddress,
      ethers.parseEther(defaultRedeemCost)
    ]
  )
  await instance.waitForDeployment()
  const proxyContractAddress = await instance.getAddress()
  console.log(`Proxy deployed to ${proxyContractAddress}`)

  if (process.env.PHASE !== undefined && consul !== undefined) {
    const consulKey = process.env.HODLER_CONSUL_KEY || 'hodler-sepolia/test-deploy'

    const updateResult = await consul.kv.set({
      key: consulKey,
      value: proxyContractAddress,
      token: consulToken
    })
    console.log(`Cluster variable updated: ${updateResult}`)
  } else {
    console.warn('Deployment env var PHASE not defined, skipping update of cluster variable in Consul.')
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
