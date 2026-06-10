"use client";

// Unified ticket price hook.
// Starknet: uses useTicketPrice (scaffold-stark, reactive polling).
// Stellar: single fetch via simulateContractCall, re-fetches on interval.
//
// Usage:
//   const { priceWei, formatted, isLoading } = useLotteryTicketPrice();

import { useEffect, useState } from "react";
import { useChain } from "~~/hooks/useChain";
import { useTicketPrice } from "~~/hooks/scaffold-stark/useTicketPrice";
import { stellarGetTicketPrice } from "~~/services/web3/stellar/transactions";
import { stellarContracts } from "~~/contracts/stellarContracts";
import { formatTokenAmount } from "~~/services/chain-adapter/types";
import scaffoldConfig from "~~/scaffold.config";

// Stellar STLP uses 7 decimals (Stellar convention)
const STELLAR_DECIMALS = 7;

export function useLotteryTicketPrice() {
  const { isStarknet } = useChain();

  // ── Starknet (always mounted, no-op when Stellar active) ──
  const starknet = useTicketPrice({ decimals: 18, watch: true });

  // ── Stellar (fetches only when Stellar active) ─────────────
  const [stellarPriceWei, setStellarPriceWei] = useState(0n);
  const [stellarLoading, setStellarLoading] = useState(false);

  const network = scaffoldConfig.stellar.network;
  const stellarLotteryId = stellarContracts[network].Lottery.contractId;

  useEffect(() => {
    if (isStarknet || !stellarLotteryId) return;

    let cancelled = false;

    const fetch = async () => {
      setStellarLoading(true);
      try {
        const price = await stellarGetTicketPrice(stellarLotteryId);
        if (!cancelled) setStellarPriceWei(price);
      } catch (e) {
        console.error("useLotteryTicketPrice (Stellar):", e);
      } finally {
        if (!cancelled) setStellarLoading(false);
      }
    };

    fetch();
    const interval = setInterval(fetch, scaffoldConfig.pollingInterval);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isStarknet, stellarLotteryId]);

  if (!isStarknet) {
    return {
      priceWei: stellarPriceWei,
      formatted: formatTokenAmount(stellarPriceWei, STELLAR_DECIMALS),
      isLoading: stellarLoading,
      error: null,
      refetch: async () => {},
    };
  }

  return starknet;
}
