"use client";

// Stellar equivalent of useBuyTickets — mirrors the same interface so
// UI components can swap between chains without changes.

import { useCallback, useState } from "react";
import { useStellarAccount } from "./useStellarAccount";
import { useStellarBalance } from "./useStellarBalance";
import {
  stellarGetAllowance,
  stellarApprove,
  stellarBuyTickets,
  stellarGetCurrentDrawId,
} from "~~/services/web3/stellar/transactions";
import { stellarContracts } from "~~/contracts/stellarContracts";
import scaffoldConfig from "~~/scaffold.config";
import type { TicketNumbers } from "~~/services/chain-adapter/types";
import type { StellarTxDeps } from "~~/services/web3/stellar/transactions";

export interface UseStellarBuyTicketsProps {
  drawId: number;
}

export function useStellarBuyTickets({ drawId }: UseStellarBuyTicketsProps) {
  const { address, isConnected, signTransaction } = useStellarAccount();
  const { balance: userBalance, formatted: userBalanceFormatted, refetch: refetchBalance } = useStellarBalance(address);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  const network = scaffoldConfig.stellar.network;
  const { Lottery, StellarPlayToken, Vault } = stellarContracts[network];

  const isValid = !!(Lottery.contractId && StellarPlayToken.contractId && address);

  const buildDeps = useCallback((): StellarTxDeps => ({
    lotteryContractId: Lottery.contractId,
    tokenContractId: StellarPlayToken.contractId,
    vaultContractId: Vault.contractId,
    callerPublicKey: address!,
    signTransaction,
  }), [Lottery.contractId, StellarPlayToken.contractId, Vault.contractId, address, signTransaction]);

  const buyTickets = useCallback(
    async (selectedNumbers: TicketNumbers, totalCost: bigint) => {
      try {
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        if (!isValid || !address) throw new Error("Stellar wallet not connected or contracts not configured");

        if (userBalance < totalCost) throw new Error("Insufficient STLP balance");

        const deps = buildDeps();

        // Check and set allowance
        const allowance = await stellarGetAllowance(deps.tokenContractId, address, deps.lotteryContractId);
        if (allowance < totalCost) {
          const approveResult = await stellarApprove(deps, deps.lotteryContractId, totalCost);
          if (!approveResult.success) throw new Error(approveResult.errorMessage ?? "Approval failed");
        }

        const numbersArray = Object.values(selectedNumbers).map((nums) => nums.map((n: number) => n));
        const quantity = numbersArray.length;

        const result = await stellarBuyTickets(deps, BigInt(drawId), numbersArray, quantity);

        if (result.success) {
          setSuccess("Tickets purchased on Stellar!");
          setTxHash(result.hash);
          await refetchBalance();
        } else {
          throw new Error(result.errorMessage ?? "Purchase failed");
        }

        return result;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error buying tickets on Stellar";
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [isValid, address, userBalance, buildDeps, drawId, refetchBalance],
  );

  const clearPurchaseState = useCallback(() => {
    setSuccess(null);
    setError(null);
    setTxHash(undefined);
  }, []);

  return {
    buyTickets,
    clearPurchaseState,
    isLoading,
    error,
    success,
    txHash,
    userBalance,
    userBalanceFormatted,
    isValid,
    contractsReady: isValid && isConnected,
    isPending: isLoading,
  };
}
