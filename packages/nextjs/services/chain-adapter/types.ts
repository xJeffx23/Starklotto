// ============================================================
// Shared types across Starknet and Stellar
// ============================================================

export type ChainId = "starknet" | "stellar";
export type StellarNetwork = "testnet" | "mainnet";
export type StarknetNetwork = "devnet" | "sepolia" | "mainnet";

export interface DrawInfo {
  drawId: bigint;
  jackpot: bigint;
  isActive: boolean;
  endLedgerOrBlock: bigint;   // ledger sequence on Stellar, block number on Starknet
  winningNumbers: number[];
  distributionDone: boolean;
  randomnessCommitted: boolean;
}

export interface TicketInfo {
  ticketId: bigint;
  drawId: bigint;
  numbers: number[];
  claimed: boolean;
  prizeAmount: bigint;
  prizeAssigned: boolean;
  timestamp: bigint;
}

export interface TxResult {
  hash: string;
  success: boolean;
  errorMessage?: string;
}

// ============================================================
// ChainAdapter — implemented separately for each chain.
// All money amounts are in the token's smallest unit (wei / stroops).
// ============================================================
export interface ChainAdapter {
  readonly chainId: ChainId;

  // ── Wallet ────────────────────────────────────────────────
  getAddress(): string | undefined;
  isConnected(): boolean;

  // ── Token ─────────────────────────────────────────────────
  getBalance(address: string): Promise<bigint>;
  getAllowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<TxResult>;

  // ── Lottery ───────────────────────────────────────────────
  getTicketPrice(): Promise<bigint>;
  getCurrentDrawId(): Promise<bigint>;
  getDrawInfo(drawId: bigint): Promise<DrawInfo | null>;
  getLedgersOrBlocksRemaining(drawId: bigint): Promise<bigint>;
  buyTickets(
    drawId: bigint,
    numbers: number[][],
    quantity: number,
    totalCost: bigint,
  ): Promise<TxResult>;
  claimPrize(drawId: bigint, ticketId: bigint): Promise<TxResult>;
  getTicket(drawId: bigint, ticketId: bigint): Promise<TicketInfo | null>;
  getUserTicketIds(address: string, drawId: bigint): Promise<bigint[]>;

  // ── Contract addresses ────────────────────────────────────
  getLotteryAddress(): string | undefined;
  getTokenAddress(): string | undefined;
  getVaultAddress(): string | undefined;
}

// ============================================================
// Shared UI types
// ============================================================

// { [ticketId]: number[] } — one entry per ticket with 5 selected numbers
export type TicketNumbers = Record<number, number[]>;

// ============================================================
// Token formatting helpers (chain-agnostic)
// ============================================================
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const base = 10n ** BigInt(decimals);
  const intPart = amount / base;
  const fracPart = amount % base;
  const fracStr = fracPart.toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fracStr.length > 0 ? `${intPart}.${fracStr}` : intPart.toString();
}
