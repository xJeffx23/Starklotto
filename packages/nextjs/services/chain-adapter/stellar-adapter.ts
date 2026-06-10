"use client";

// Stellar adapter — translates ChainAdapter into Soroban contract calls
// via the @stellar/stellar-sdk and Freighter wallet.

import type { ChainAdapter, DrawInfo, TicketInfo, TxResult } from "./types";

// Raw draw shape returned by Soroban contract (decoded from XDR)
interface RawDraw {
  draw_id: bigint;
  accumulated_prize: bigint;
  winning_numbers: number[];
  is_active: boolean;
  end_ledger: number;
  distribution_done: boolean;
  randomness_committed: boolean;
}

// Raw ticket shape returned by Soroban contract
interface RawTicket {
  ticket_id: bigint;
  draw_id: bigint;
  numbers: number[];
  claimed: boolean;
  prize_amount: bigint;
  prize_assigned: boolean;
  timestamp: bigint;
}

export interface StellarAdapterDeps {
  address: string | undefined;
  connected: boolean;
  lotteryContractId: string | undefined;
  tokenContractId: string | undefined;
  vaultContractId: string | undefined;
  invokeContract: (
    contractId: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>;
  sendTransaction: (
    contractId: string,
    method: string,
    args: unknown[],
    caller: string,
  ) => Promise<TxResult>;
}

export function createStellarAdapter(deps: StellarAdapterDeps): ChainAdapter {
  const { address, connected, lotteryContractId, tokenContractId, vaultContractId } = deps;

  const readLottery = (method: string, args: unknown[]) =>
    deps.invokeContract(lotteryContractId!, method, args);

  const readToken = (method: string, args: unknown[]) =>
    deps.invokeContract(tokenContractId!, method, args);

  const writeLottery = (method: string, args: unknown[]) =>
    deps.sendTransaction(lotteryContractId!, method, args, address!);

  const writeToken = (method: string, args: unknown[]) =>
    deps.sendTransaction(tokenContractId!, method, args, address!);

  return {
    chainId: "stellar",

    getAddress: () => address,
    isConnected: () => connected,

    async getBalance(addr: string): Promise<bigint> {
      const raw = await readToken("balance", [addr]);
      return BigInt((raw as number | string | bigint) ?? 0n);
    },

    async getAllowance(owner: string, spender: string): Promise<bigint> {
      const raw = await readToken("allowance", [owner, spender]);
      return BigInt((raw as number | string | bigint) ?? 0n);
    },

    async approve(spender: string, amount: bigint): Promise<TxResult> {
      // expiration_ledger = current + 100_000 (roughly ~3 days of padding)
      return writeToken("approve", [address, spender, amount, 999_999_999]);
    },

    async getTicketPrice(): Promise<bigint> {
      const raw = await readLottery("get_ticket_price", []);
      return BigInt((raw as number | string | bigint) ?? 0n);
    },

    async getCurrentDrawId(): Promise<bigint> {
      const raw = await readLottery("get_current_draw_id", []);
      return BigInt((raw as number | string | bigint) ?? 0n);
    },

    async getDrawInfo(drawId: bigint): Promise<DrawInfo | null> {
      const raw = (await readLottery("get_draw", [drawId])) as RawDraw | null;
      if (!raw) return null;
      return {
        drawId: BigInt(raw.draw_id),
        jackpot: BigInt(raw.accumulated_prize),
        isActive: raw.is_active,
        endLedgerOrBlock: BigInt(raw.end_ledger),
        winningNumbers: raw.winning_numbers ?? [],
        distributionDone: raw.distribution_done,
        randomnessCommitted: raw.randomness_committed,
      };
    },

    async getLedgersOrBlocksRemaining(drawId: bigint): Promise<bigint> {
      const raw = await readLottery("get_ledgers_remaining", [drawId]);
      return BigInt((raw as number | string | bigint) ?? 0n);
    },

    async buyTickets(
      drawId: bigint,
      numbers: number[][],
      quantity: number,
      _totalCost: bigint,
    ): Promise<TxResult> {
      return writeLottery("buy_ticket", [address, drawId, numbers, quantity]);
    },

    async claimPrize(drawId: bigint, ticketId: bigint): Promise<TxResult> {
      return writeLottery("claim_prize", [drawId, ticketId]);
    },

    async getTicket(drawId: bigint, ticketId: bigint): Promise<TicketInfo | null> {
      const raw = (await readLottery("get_ticket", [drawId, ticketId])) as RawTicket | null;
      if (!raw) return null;
      return {
        ticketId: BigInt(raw.ticket_id),
        drawId: BigInt(raw.draw_id),
        numbers: raw.numbers ?? [],
        claimed: raw.claimed,
        prizeAmount: BigInt(raw.prize_amount),
        prizeAssigned: raw.prize_assigned,
        timestamp: BigInt(raw.timestamp),
      };
    },

    async getUserTicketIds(addr: string, drawId: bigint): Promise<bigint[]> {
      const raw = (await readLottery("get_user_tickets", [addr, drawId])) as (number | string | bigint)[];
      return (raw ?? []).map((id) => BigInt(id));
    },

    getLotteryAddress: () => lotteryContractId,
    getTokenAddress: () => tokenContractId,
    getVaultAddress: () => vaultContractId,
  };
}
