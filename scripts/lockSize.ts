import 'dotenv/config'
import { ethers } from 'hardhat'
import Consul from 'consul'
import { abi as hodlerAbi } from '../artifacts/contracts/Hodler.sol/Hodler.json'

async function main() {
  let consul
  const consulToken = process.env.CONSUL_TOKEN || undefined
  let hodlerAddress = ''

  if (process.env.PHASE !== undefined && process.env.CONSUL_IP !== undefined) {
    console.log(`Connecting to Consul at ${process.env.CONSUL_IP}:${process.env.CONSUL_PORT}...`)
    consul = new Consul({
      host: process.env.CONSUL_IP,
      port: process.env.CONSUL_PORT,
    });

    hodlerAddress = (await consul.kv.get<{ Value: string }>({
      key: process.env.HODLER_CONSUL_KEY || 'dummy-path',
      token: consulToken
    })).Value
  }

  console.log(`Updating hodler ${hodlerAddress} with new lock size...`)

  const deployerPrivateKey = process.env.HODLER_OPERATOR_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // HH #1
  const [ owner ] = await ethers.getSigners()

  const deployer = deployerPrivateKey
    ? new ethers.Wallet(
        deployerPrivateKey,
        new ethers.JsonRpcProvider(process.env.JSON_RPC)
      )
    : owner
  
  
  const contract = new ethers.Contract(hodlerAddress, hodlerAbi, deployer.provider).connect(deployer)

  const lockSize = ethers.parseEther('100')
  // @ts-ignore
  const result = await contract.setLockSize(lockSize)
  await result.wait()

  console.log(`Lock size updated to ${lockSize} for hodler ${hodlerAddress}`)

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
