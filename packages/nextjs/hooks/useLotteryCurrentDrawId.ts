"use client";

// Unified current draw ID hook.
// Starknet: reads from Lottery contract via scaffold-stark.
// Stellar: reads via Soroban simulate call.
//
// Usage:
//   const { currentDrawId } = useLotteryCurrentDrawId();

import { useEffect, useState } from "react";
import { useChain } from "~~/hooks/useChain";
import { useCurrentDrawId } from "~~/hooks/scaffold-stark/useCurrentDrawId";
import { stellarGetCurrentDrawId } from "~~/services/web3/stellar/transactions";
import { stellarContracts } from "~~/contracts/stellarContracts";
import scaffoldConfig from "~~/scaffold.config";

export function useLotteryCurrentDrawId() {
  const { isStarknet } = useChain();

  // ── Starknet ──────────────────────────────────────────────
  const starknet = useCurrentDrawId();

  // ── Stellar ───────────────────────────────────────────────
  const [stellarDrawId, setStellarDrawId] = useState(0);

  const network = scaffoldConfig.stellar.network;
  const stellarLotteryId = stellarContracts[network].Lottery.contractId;

  useEffect(() => {
    if (isStarknet || !stellarLotteryId) return;

    let cancelled = false;

    const fetch = async () => {
      try {
        const id = await stellarGetCurrentDrawId(stellarLotteryId);
        if (!cancelled) setStellarDrawId(Number(id));
      } catch (e) {
        console.error("useLotteryCurrentDrawId (Stellar):", e);
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
    return { currentDrawId: stellarDrawId };
  }

  return starknet;
}
