"use client";

// Starknet adapter — thin wrapper around existing scaffold-stark hooks.
// It translates the ChainAdapter interface into the Starknet-specific calls
// already implemented in hooks/scaffold-stark/.

import type { ChainAdapter, DrawInfo, TicketInfo, TxResult } from "./types";

// The Starknet adapter is NOT a standalone class; it is assembled from
// React hooks inside a component. This factory is called from useChainAdapter().
export function createStarknetAdapter(
  address: string | undefined,
  connected: boolean,
  contracts: {
    Lottery: string | undefined;
    StarkPlayERC20: string | undefined;
    StarkPlayVault: string | undefined;
  },
  calls: {
    readContract: (contractName: string, fn: string, args: unknown[]) => Promise<unknown>;
    writeContract: (contractName: string, fn: string, args: unknown[]) => Promise<string>;
  },
): ChainAdapter {
  return {
    chainId: "starknet",

    getAddress: () => address,
    isConnected: () => connected,

    async getBalance(addr: string): Promise<bigint> {
      const raw = await calls.readContract("StarkPlayERC20", "balance_of", [addr]);
      return BigInt((raw as string | number | bigint) ?? 0n);
    },

    async getAllowance(owner: string, spender: string): Promise<bigint> {
      const raw = await calls.readContract("StarkPlayERC20", "allowance", [owner, spender]);
      return BigInt((raw as string | number | bigint) ?? 0n);
    },

    async approve(spender: string, amount: bigint): Promise<TxResult> {
      const hash = await calls.writeContract("StarkPlayERC20", "approve", [spender, amount]);
      return { hash, success: true };
    },

    async getTicketPrice(): Promise<bigint> {
      const raw = await calls.readContract("Lottery", "GetTicketPrice", []);
      return BigInt((raw as string | number | bigint) ?? 0n);
    },

    async getCurrentDrawId(): Promise<bigint> {
      const raw = await calls.readContract("Lottery", "GetCurrentDrawId", []);
      return BigInt((raw as string | number | bigint) ?? 0n);
    },

    async getDrawInfo(drawId: bigint): Promise<DrawInfo | null> {
      const raw = await calls.readContract("Lottery", "GetDraw", [drawId]) as Record<string, unknown> | null;
      if (!raw) return null;
      return {
        drawId,
        jackpot: BigInt((raw.accumulatedPrize as string | bigint) ?? 0n),
        isActive: Boolean(raw.isActive),
        endLedgerOrBlock: BigInt((raw.endBlock as string | bigint) ?? 0n),
        winningNumbers: (raw.winningNumbers as number[]) ?? [],
        distributionDone: Boolean(raw.distributionDone),
        randomnessCommitted: false,
      };
    },

    async getLedgersOrBlocksRemaining(drawId: bigint): Promise<bigint> {
      const raw = await calls.readContract("Lottery", "GetBlocksRemaining", [drawId]);
      return BigInt((raw as string | number | bigint) ?? 0n);
    },

    async buyTickets(
      drawId: bigint,
      numbers: number[][],
      quantity: number,
      _totalCost: bigint,
    ): Promise<TxResult> {
      const hash = await calls.writeContract("Lottery", "BuyTicket", [drawId, numbers, quantity]);
      return { hash, success: true };
    },

    async claimPrize(drawId: bigint, ticketId: bigint): Promise<TxResult> {
      const hash = await calls.writeContract("Lottery", "ClaimPrize", [drawId, ticketId]);
      return { hash, success: true };
    },

    async getTicket(drawId: bigint, ticketId: bigint): Promise<TicketInfo | null> {
      const raw = await calls.readContract("Lottery", "GetTicket", [drawId, ticketId]) as Record<string, unknown> | null;
      if (!raw) return null;
      return {
        ticketId,
        drawId,
        numbers: (raw.numbers as number[]) ?? [],
        claimed: Boolean(raw.claimed),
        prizeAmount: BigInt((raw.prizeAmount as string | bigint) ?? 0n),
        prizeAssigned: Boolean(raw.prizeAssigned),
        timestamp: BigInt((raw.timestamp as string | bigint) ?? 0n),
      };
    },

    async getUserTicketIds(addr: string, drawId: bigint): Promise<bigint[]> {
      const raw = await calls.readContract("Lottery", "GetUserTickets", [addr, drawId]);
      const arr = (raw as (string | number | bigint)[]) ?? [];
      return arr.map((id) => BigInt(id));
    },

    getLotteryAddress: () => contracts.Lottery,
    getTokenAddress: () => contracts.StarkPlayERC20,
    getVaultAddress: () => contracts.StarkPlayVault,
  };
}
