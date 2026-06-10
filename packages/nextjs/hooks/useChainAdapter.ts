"use client";

// THE central hook for dual-chain writes.
//
// Usage in any component:
//   const adapter = useChainAdapter();
//   await adapter.buyTickets(drawId, numbers, quantity);
//   await adapter.approve(spender, amount);
//   await adapter.claimPrize(drawId, ticketId);
//
// Reads are NOT handled here — use useLottery* hooks for reactive data.
// Both chain hooks are always called (React rules), but only the active
// chain's adapter is returned. The inactive one is a dormant no-op.

import { useMemo } from "react";
import { useChain } from "~~/hooks/useChain";
import { useAccount } from "~~/hooks/useAccount";
import { useContractAddresses } from "~~/hooks/useContractAddresses";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-stark/useScaffoldWriteContract";
import { useStellarAccount } from "~~/hooks/scaffold-stellar/useStellarAccount";
import { stellarContracts } from "~~/contracts/stellarContracts";
import scaffoldConfig from "~~/scaffold.config";
import {
  stellarApprove,
  stellarBuyTickets,
  stellarClaimPrize,
} from "~~/services/web3/stellar/transactions";
import type { ChainAdapter, TxResult } from "~~/services/chain-adapter/types";

// ── Public hook ───────────────────────────────────────────────

export function useChainAdapter(): ChainAdapter {
  const { activeChain } = useChain();

  // Both hooks must be called unconditionally (Rules of Hooks).
  // The inactive one is a no-op because its contracts are invalid.
  const starknet = useStarknetWriteAdapter();
  const stellar = useStellarWriteAdapter();

  return activeChain === "stellar" ? stellar : starknet;
}

// ── Starknet write adapter ────────────────────────────────────

function useStarknetWriteAdapter(): ChainAdapter {
  const { address, isConnected } = useAccount();
  const contracts = useContractAddresses();

  const { sendAsync: approveAsync } = useScaffoldWriteContract({
    contractName: "StarkPlayERC20",
    functionName: "approve",
    args: [] as any,
  });

  const { sendAsync: buyAsync } = useScaffoldWriteContract({
    contractName: "Lottery",
    functionName: "BuyTicket",
    args: [] as any,
  });

  const { sendAsync: claimAsync } = useScaffoldWriteContract({
    contractName: "Lottery",
    functionName: "ClaimPrize",
    args: [] as any,
  });

  return useMemo<ChainAdapter>(
    () => ({
      chainId: "starknet",
      getAddress: () => address,
      isConnected: () => Boolean(isConnected),

      // ── Reads: not implemented — use useLottery* hooks ──
      async getBalance() { return 0n; },
      async getAllowance() { return 0n; },
      async getTicketPrice() { return 0n; },
      async getCurrentDrawId() { return 0n; },
      async getDrawInfo() { return null; },
      async getLedgersOrBlocksRemaining() { return 0n; },
      async getTicket() { return null; },
      async getUserTicketIds() { return []; },

      // ── Writes ──────────────────────────────────────────
      async approve(spender, amount): Promise<TxResult> {
        const r = await approveAsync({ args: [spender, amount] });
        return txResult(r);
      },

      async buyTickets(drawId, numbers, quantity): Promise<TxResult> {
        const r = await buyAsync({ args: [drawId, numbers, quantity] });
        return txResult(r);
      },

      async claimPrize(drawId, ticketId): Promise<TxResult> {
        const r = await claimAsync({ args: [drawId, ticketId] });
        return txResult(r);
      },

      getLotteryAddress: () => contracts.Lottery,
      getTokenAddress: () => contracts.StarkPlayERC20,
      getVaultAddress: () => contracts.StarkPlayVault,
    }),
    [address, isConnected, contracts, approveAsync, buyAsync, claimAsync],
  );
}

// ── Stellar write adapter ─────────────────────────────────────

function useStellarWriteAdapter(): ChainAdapter {
  const { address, isConnected, signTransaction } = useStellarAccount();
  const network = scaffoldConfig.stellar.network;
  const { Lottery, StellarPlayToken, Vault } = stellarContracts[network];

  return useMemo<ChainAdapter>(
    () => {
      const deps = {
        lotteryContractId: Lottery.contractId,
        tokenContractId: StellarPlayToken.contractId,
        vaultContractId: Vault.contractId,
        callerPublicKey: address ?? "",
        signTransaction,
      };

      return {
        chainId: "stellar",
        getAddress: () => address,
        isConnected: () => isConnected,

        // ── Reads: not implemented — use useLottery* hooks ──
        async getBalance() { return 0n; },
        async getAllowance() { return 0n; },
        async getTicketPrice() { return 0n; },
        async getCurrentDrawId() { return 0n; },
        async getDrawInfo() { return null; },
        async getLedgersOrBlocksRemaining() { return 0n; },
        async getTicket() { return null; },
        async getUserTicketIds() { return []; },

        // ── Writes ──────────────────────────────────────────
        approve: (spender, amount) => stellarApprove(deps, spender, amount),
        buyTickets: (drawId, numbers) => stellarBuyTickets(deps, drawId, numbers, numbers.length),
        claimPrize: (drawId, ticketId) => stellarClaimPrize(deps, drawId, ticketId),

        getLotteryAddress: () => Lottery.contractId || undefined,
        getTokenAddress: () => StellarPlayToken.contractId || undefined,
        getVaultAddress: () => Vault.contractId || undefined,
      };
    },
    [address, isConnected, signTransaction, Lottery.contractId, StellarPlayToken.contractId, Vault.contractId],
  );
}

// ── Helper ────────────────────────────────────────────────────

function txResult(r: unknown): TxResult {
  if (!r) return { hash: "", success: false };
  if (typeof r === "string") return { hash: r, success: true };
  const obj = r as Record<string, unknown>;
  return { hash: (obj.transaction_hash as string) ?? "", success: true };
}
