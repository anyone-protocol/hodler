import 'dotenv/config'
import { ethers } from 'hardhat'

async function main() {
  const implementationAddress = process.env.IMPL_ADDRESS || '0x33584122E2b9A1BAe76E9cAdd9743f7021bc8882'
  
  console.log(`Checking implementation at ${implementationAddress}...`)

  const impl = await ethers.getContractAt('HodlerV3', implementationAddress)
  
  try {
    const version = await impl.version()
    console.log(`Implementation version: ${version}`)
  } catch (error) {
    console.error('Error reading version:', error)
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
