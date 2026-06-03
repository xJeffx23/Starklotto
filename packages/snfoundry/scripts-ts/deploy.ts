import {
  deployContract,
  executeDeployCalls,
  exportDeployments,
  deployer,
} from "./deploy-contract";
import { green } from "./helpers/colorize-log";
import fs from "fs";
import path from "path";

/**
 * Deploy a contract using the specified parameters.
 *
 * @example (deploy contract with constructorArgs)
 * const deployScript = async (): Promise<void> => {
 *   await deployContract(
 *     {
 *       contract: "YourContract",
 *       contractName: "YourContractExportName",
 *       constructorArgs: {
 *         owner: deployer.address,
 *       },
 *       options: {
 *         maxFee: BigInt(1000000000000)
 *       }
 *     }
 *   );
 * };
 *
 * @example (deploy contract without constructorArgs)
 * const deployScript = async (): Promise<void> => {
 *   await deployContract(
 *     {
 *       contract: "YourContract",
 *       contractName: "YourContractExportName",
 *       options: {
 *         maxFee: BigInt(1000000000000)
 *       }
 *     }
 *   );
 * };
 *
 *
 * @returns {Promise<void>}
 */

const deployScript = async (): Promise<void> => {
  // Deploy StarkPlayERC20 first
  const starkPlayERC20DeploymentResult = await deployContract({
    contract: "StarkPlayERC20",
    contractName: "StarkPlayERC20",
    constructorArgs: {
      recipient: deployer.address, // Assuming deployer is the initial recipient
      admin: deployer.address, // Assuming deployer is the admin
    },
  });
  const starkPlayERC20Address = starkPlayERC20DeploymentResult.address;

  // Basic check for a valid address
  if (
    !starkPlayERC20Address ||
    starkPlayERC20Address === "" ||
    starkPlayERC20Address.startsWith(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    )
  ) {
    // StarkNet addresses are typically non-zero. Checking for a long string of zeros as a simple heuristic.
    // A more robust check might involve regex or library functions if available.
    throw new Error(
      `Failed to deploy StarkPlayERC20 or address is invalid: ${starkPlayERC20Address}`
    );
  }

  // Deploy StarkPlayVault
  const starkPlayVaultDeploymentResult = await deployContract({
    contract: "StarkPlayVault",
    contractName: "StarkPlayVault",
    constructorArgs: {
      owner: deployer.address,
      starkPlayToken: starkPlayERC20Address, // Pass the deployed StarkPlayERC20 address
      feePercentage: 50, // Default fee percentage, adjust as needed
    },
  });
  const starkPlayVaultAddress = starkPlayVaultDeploymentResult.address;

  // Basic check for a valid address
  if (
    !starkPlayVaultAddress ||
    starkPlayVaultAddress === "" ||
    starkPlayVaultAddress.startsWith(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    )
  ) {
    throw new Error(
      `Failed to deploy StarkPlayVault or address is invalid: ${starkPlayVaultAddress}`
    );
  }

  // Deploy Lottery with dynamic addresses including Randomness contract address
  console.log("Deploying Lottery contract...");
  // Usar dirección del contrato Randomness desplegado en src_adapter
  const deployedRandomnessAddress = "0x7266650b528cb414c7445d6628a1f8d269b54193550e4cd7813177f8fc824fc"; // Devnet address

  const lotteryDeploymentResult = await deployContract({
    contract: "Lottery",
    contractName: "Lottery",
    constructorArgs: {
      owner: deployer.address,
      strkPlayContractAddress: starkPlayERC20Address,
      strkPlayVaultContractAddress: starkPlayVaultAddress,
      randomnessContractAddress: deployedRandomnessAddress,  // Dirección del contrato Randomness existente
    },
  });
  const lotteryAddress = lotteryDeploymentResult.address;

  // Basic check for a valid address
  if (
    !lotteryAddress ||
    lotteryAddress === "" ||
    lotteryAddress.startsWith(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    )
  ) {
    throw new Error(
      `Failed to deploy Lottery or address is invalid: ${lotteryAddress}`
    );
  }

  console.log(`Lottery deployed successfully at address: ${lotteryAddress}`);

  // Execute pending deploy calls and wait for confirmation
  console.log("Executing deployment calls and waiting for confirmation...");
  await executeDeployCalls();
  console.log("All deployments confirmed successfully");

  // Post-deploy role assignment: Configure token permissions following best practices
  console.log("Assigning roles to StarkPlayVault...");
  try {
    const { Contract } = await import("starknet");
    
    // Load StarkPlayERC20 contract ABI to interact with it
    const starkPlayTokenCompiledContract = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../contracts/target/dev/contracts_StarkPlayERC20.contract_class.json"),
        "utf8"
      )
    );

    const starkPlayTokenContract = new Contract(
      starkPlayTokenCompiledContract.abi,
      starkPlayERC20Address,
      deployer
    );

    // Owner (deployer) assigns MINTER_ROLE to the vault
    console.log("Granting MINTER_ROLE to vault...");
    await starkPlayTokenContract.grant_minter_role(starkPlayVaultAddress);
    
    // Set minter allowance for the vault
    const mint_allowance = 1_000_000_000n * 1000000000000000000n; // 1B tokens with 18 decimals
    await starkPlayTokenContract.set_minter_allowance(starkPlayVaultAddress, mint_allowance);
    
    // Owner (deployer) assigns BURNER_ROLE to the vault
    console.log("Granting BURNER_ROLE to vault...");
    await starkPlayTokenContract.grant_burner_role(starkPlayVaultAddress);
    
    // Set burner allowance for the vault  
    const burn_allowance = 1_000_000_000n * 1000000000000000000n; // 1B tokens with 18 decimals
    await starkPlayTokenContract.set_burner_allowance(starkPlayVaultAddress, burn_allowance);

    // Owner (deployer) assigns PRIZE_ASSIGNER_ROLE to Lottery contract
    console.log("Granting PRIZE_ASSIGNER_ROLE to Lottery...");
    await starkPlayTokenContract.grant_prize_assigner_role(lotteryAddress);

    console.log("StarkPlayVault roles assigned successfully by owner");
    console.log("Lottery PRIZE_ASSIGNER_ROLE assigned successfully");
  } catch (error) {
    console.error("Failed to assign vault roles:", error);
    throw new Error(`Vault role assignment failed: ${error}`);
  }

  // Deploy LottoTicketNFT and wire it to Lottery
  console.log("Deploying LottoTicketNFT contract...");
  const nftDeploymentResult = await deployContract({
    contract: "LottoTicketNFT",
    contractName: "LottoTicketNFT",
    constructorArgs: {
      owner: deployer.address,
      name: "StarkLotto Ticket",
      symbol: "SLOTTO",
      base_uri: "https://starklotto.io/api/ticket/",
    },
  });
  const nftAddress = nftDeploymentResult.address;

  if (
    !nftAddress ||
    nftAddress === "" ||
    nftAddress.startsWith(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    )
  ) {
    throw new Error(`Failed to deploy LottoTicketNFT or address is invalid: ${nftAddress}`);
  }
  console.log(`LottoTicketNFT deployed successfully at address: ${nftAddress}`);

  // Execute NFT deployment before post-deploy calls
  await executeDeployCalls();

  try {
    const { Contract } = await import("starknet");

    // Load LottoTicketNFT ABI
    const nftCompiledContract = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../contracts/target/dev/contracts_LottoTicketNFT.contract_class.json"),
        "utf8"
      )
    );

    const nftContract = new Contract(nftCompiledContract.abi, nftAddress, deployer);

    // Allow Lottery to call mint_ticket on the NFT contract
    console.log("Setting lottery contract on LottoTicketNFT...");
    await nftContract.set_lottery_contract(lotteryAddress);
    console.log("LottoTicketNFT lottery contract set successfully");

    // Load Lottery ABI
    const lotteryCompiledContract = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../contracts/target/dev/contracts_Lottery.contract_class.json"),
        "utf8"
      )
    );

    const lotteryContract = new Contract(lotteryCompiledContract.abi, lotteryAddress, deployer);

    // Register NFT address in Lottery
    console.log("Setting NFT contract address on Lottery...");
    await lotteryContract.SetNFTContractAddress(nftAddress);
    console.log("Lottery NFT contract address set successfully");
  } catch (error) {
    console.error("Failed to wire NFT contract:", error);
    throw new Error(`NFT wiring failed: ${error}`);
  }
};

const main = async (): Promise<void> => {
  try {
    await deployScript();
    // executeDeployCalls() is already called inside deployScript() - no need to call it again
    exportDeployments();

    console.log(green("All Setup Done!"));
  } catch (err) {
    console.log(err);
    process.exit(1); //exit with error so that non subsequent scripts are run
  }
};

main();
