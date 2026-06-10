"use client";

// Unified wallet hook — returns the connected account for whichever chain is active.
// Replaces direct imports of useAccount() from @starknet-react/core in pages that
// need to support both chains.
//
// Usage:
//   const { address, isConnected } = useWalletAccount();

import { useChain } from "~~/hooks/useChain";
import { useAccount as useStarknetAccount } from "~~/hooks/useAccount";
import { useStellarAccount } from "~~/hooks/scaffold-stellar/useStellarAccount";

export interface WalletAccount {
  address: string | undefined;
  isConnected: boolean;
  chainId: "starknet" | "stellar";
}

export function useWalletAccount(): WalletAccount {
  const { activeChain } = useChain();

  // Both hooks are always called — React rules.
  // Each one only polls its own chain; the inactive one is dormant.
  const starknet = useStarknetAccount();
  const stellar = useStellarAccount();

  if (activeChain === "stellar") {
    return {
      address: stellar.address,
      isConnected: stellar.isConnected,
      chainId: "stellar",
    };
  }

  return {
    address: starknet.address,
    isConnected: starknet.status === "connected",
    chainId: "starknet",
  };
}
