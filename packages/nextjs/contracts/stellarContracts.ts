// Stellar contract IDs (equivalent of deployedContracts.ts for Starknet).
// Filled manually after deploying with: stellar contract deploy ...
// These are also set via NEXT_PUBLIC_STELLAR_* environment variables.

export const stellarContracts = {
  testnet: {
    Lottery: {
      contractId: process.env.NEXT_PUBLIC_STELLAR_LOTTERY_CONTRACT ?? "",
      network: "testnet" as const,
    },
    StellarPlayToken: {
      contractId: process.env.NEXT_PUBLIC_STELLAR_TOKEN_CONTRACT ?? "",
      network: "testnet" as const,
    },
    Vault: {
      contractId: process.env.NEXT_PUBLIC_STELLAR_VAULT_CONTRACT ?? "",
      network: "testnet" as const,
    },
  },
  mainnet: {
    Lottery: {
      contractId: process.env.NEXT_PUBLIC_STELLAR_MAINNET_LOTTERY_CONTRACT ?? "",
      network: "mainnet" as const,
    },
    StellarPlayToken: {
      contractId: process.env.NEXT_PUBLIC_STELLAR_MAINNET_TOKEN_CONTRACT ?? "",
      network: "mainnet" as const,
    },
    Vault: {
      contractId: process.env.NEXT_PUBLIC_STELLAR_MAINNET_VAULT_CONTRACT ?? "",
      network: "mainnet" as const,
    },
  },
} as const;

export type StellarNetworkKey = keyof typeof stellarContracts;
export type StellarContractName = keyof typeof stellarContracts.testnet;
