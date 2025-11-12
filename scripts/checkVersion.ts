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

  console.log(`Checking version of Hodler proxy at ${proxyAddress}...`)

  const hodler = await ethers.getContractAt('HodlerV3', proxyAddress)
  
  const version = await hodler.version()
  console.log(`Current contract version: ${version}`)
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
