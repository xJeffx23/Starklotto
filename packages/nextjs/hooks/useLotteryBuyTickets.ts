"use client";

// Unified lottery ticket purchase hook.
// Automatically routes to the Starknet or Stellar implementation
// based on the active chain in ChainContext.
//
// Pages import THIS hook — never the chain-specific ones directly.
//
// Usage:
//   const { buyTickets, userBalance, isLoading } = useLotteryBuyTickets({ drawId });

import { useChain } from "~~/hooks/useChain";
import { useBuyTickets } from "~~/hooks/scaffold-stark/useBuyTickets";
import { useStellarBuyTickets } from "~~/hooks/scaffold-stellar/useStellarBuyTickets";

export interface UseLotteryBuyTicketsProps {
  drawId: number;
}

export function useLotteryBuyTickets({ drawId }: UseLotteryBuyTicketsProps) {
  const { isStarknet } = useChain();

  // Parallel pattern: both hooks are always called.
  // Each hook checks its own `isValid` flag and becomes a no-op
  // when its chain's contracts are not configured.
  const starknet = useBuyTickets({ drawId });
  const stellar = useStellarBuyTickets({ drawId });

  return isStarknet ? starknet : stellar;
}
