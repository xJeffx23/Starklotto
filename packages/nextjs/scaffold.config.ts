import { Chain } from "@starknet-react/chains";
import { supportedChains as chains } from "./supportedChains";

export type ScaffoldConfig = {
  // ── Starknet ─────────────────────────────────────────────
  targetNetworks: readonly Chain[];
  pollingInterval: number;
  onlyLocalBurnerWallet: boolean;
  rpcProviderUrl: {
    [key: string]: string;
  };
  walletAutoConnect: boolean;
  autoConnectTTL: number;
  // ── Stellar ──────────────────────────────────────────────
  stellar: {
    network: "testnet" | "mainnet";
    horizonUrl: string;
    sorobanRpcUrl: string;
  };
};

const scaffoldConfig = {
  // ── Starknet (unchanged) ──────────────────────────────────
  targetNetworks: [chains.devnet],
  onlyLocalBurnerWallet: false,
  rpcProviderUrl: {
    devnet:
      process.env.NEXT_PUBLIC_DEVNET_PROVIDER_URL ||
      process.env.NEXT_PUBLIC_PROVIDER_URL ||
      "",
    sepolia:
      process.env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL ||
      process.env.NEXT_PUBLIC_PROVIDER_URL ||
      "",
    mainnet:
      process.env.NEXT_PUBLIC_MAINNET_PROVIDER_URL ||
      process.env.NEXT_PUBLIC_PROVIDER_URL ||
      "",
  },
  pollingInterval: 30_000,
  autoConnectTTL: 60000,
  walletAutoConnect: true,

  // ── Stellar ───────────────────────────────────────────────
  stellar: {
    network: (process.env.NEXT_PUBLIC_STELLAR_NETWORK as "testnet" | "mainnet") || "testnet",
    horizonUrl:
      process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ||
      "https://horizon-testnet.stellar.org",
    sorobanRpcUrl:
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL ||
      "https://soroban-testnet.stellar.org",
  },
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
