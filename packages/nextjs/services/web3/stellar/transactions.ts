// High-level transaction helpers for Stellar lottery operations.
// Consumed by hooks/scaffold-stellar/.

import { simulateContractCall, submitContractTransaction } from "./provider";
import type { TxResult } from "../../chain-adapter/types";

export interface StellarTxDeps {
  lotteryContractId: string;
  tokenContractId: string;
  vaultContractId: string;
  callerPublicKey: string;
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
}

// ── Read (simulation) ──────────────────────────────────────────

export async function stellarGetTicketPrice(lotteryContractId: string): Promise<bigint> {
  const result = await simulateContractCall(lotteryContractId, "get_ticket_price", []);
  return BigInt((result as number | string | bigint) ?? 0n);
}

export async function stellarGetCurrentDrawId(lotteryContractId: string): Promise<bigint> {
  const result = await simulateContractCall(lotteryContractId, "get_current_draw_id", []);
  return BigInt((result as number | string | bigint) ?? 0n);
}

export async function stellarGetDraw(lotteryContractId: string, drawId: bigint) {
  return simulateContractCall(lotteryContractId, "get_draw", [drawId]);
}

export async function stellarGetBalance(tokenContractId: string, address: string): Promise<bigint> {
  const result = await simulateContractCall(tokenContractId, "balance", [address]);
  return BigInt((result as number | string | bigint) ?? 0n);
}

export async function stellarGetAllowance(
  tokenContractId: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  const result = await simulateContractCall(tokenContractId, "allowance", [owner, spender]);
  return BigInt((result as number | string | bigint) ?? 0n);
}

export async function stellarGetUserTickets(
  lotteryContractId: string,
  player: string,
  drawId: bigint,
): Promise<bigint[]> {
  const result = await simulateContractCall(lotteryContractId, "get_user_tickets", [player, drawId]);
  const arr = (result as (number | string | bigint)[]) ?? [];
  return arr.map((id) => BigInt(id));
}

export async function stellarGetLedgersRemaining(
  lotteryContractId: string,
  drawId: bigint,
): Promise<bigint> {
  const result = await simulateContractCall(lotteryContractId, "get_ledgers_remaining", [drawId]);
  return BigInt((result as number | string | bigint) ?? 0n);
}

// ── Write (signed transactions) ────────────────────────────────

export async function stellarApprove(
  deps: StellarTxDeps,
  spender: string,
  amount: bigint,
): Promise<TxResult> {
  return submitContractTransaction(
    deps.tokenContractId,
    "approve",
    [deps.callerPublicKey, spender, amount, 999_999_999],
    deps.callerPublicKey,
    deps.signTransaction,
  );
}

export async function stellarBuyTickets(
  deps: StellarTxDeps,
  drawId: bigint,
  numbers: number[][],
  quantity: number,
): Promise<TxResult> {
  return submitContractTransaction(
    deps.lotteryContractId,
    "buy_ticket",
    [deps.callerPublicKey, drawId, numbers, quantity],
    deps.callerPublicKey,
    deps.signTransaction,
  );
}

export async function stellarClaimPrize(
  deps: StellarTxDeps,
  drawId: bigint,
  ticketId: bigint,
): Promise<TxResult> {
  return submitContractTransaction(
    deps.lotteryContractId,
    "claim_prize",
    [drawId, ticketId],
    deps.callerPublicKey,
    deps.signTransaction,
  );
}
