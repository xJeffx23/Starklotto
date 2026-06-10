"use client";

// Returns the STLP token balance for a Stellar address, polling every 30s.

import { useCallback, useEffect, useState } from "react";
import { stellarGetBalance } from "~~/services/web3/stellar/transactions";
import scaffoldConfig from "~~/scaffold.config";
import { stellarContracts } from "~~/contracts/stellarContracts";
import { formatTokenAmount } from "~~/services/chain-adapter";

export interface StellarBalanceResult {
  balance: bigint;
  formatted: string;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useStellarBalance(address: string | undefined): StellarBalanceResult {
  const [balance, setBalance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(false);

  const network = scaffoldConfig.stellar.network;
  const tokenContractId = stellarContracts[network].StellarPlayToken.contractId;

  const refetch = useCallback(async () => {
    if (!address || !tokenContractId) return;
    setIsLoading(true);
    try {
      const raw = await stellarGetBalance(tokenContractId, address);
      setBalance(raw);
    } catch (e) {
      console.error("useStellarBalance fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [address, tokenContractId]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, scaffoldConfig.pollingInterval);
    return () => clearInterval(interval);
  }, [refetch]);

  return {
    balance,
    // STLP uses 7 decimals (Stellar native convention)
    formatted: formatTokenAmount(balance, 7, 4),
    isLoading,
    refetch,
  };
}
