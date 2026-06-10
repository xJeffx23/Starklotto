// Stellar / Soroban RPC provider utilities.
// Wraps @stellar/stellar-sdk for contract simulation and submission.
//
// Install dependency before using:
//   yarn workspace @ss-2/nextjs add @stellar/stellar-sdk

import scaffoldConfig from "~~/scaffold.config";
import type { TxResult } from "../../chain-adapter/types";

// ── Network helpers ────────────────────────────────────────────

export function getStellarNetwork(): "testnet" | "mainnet" {
  return scaffoldConfig.stellar.network;
}

export function getHorizonUrl(): string {
  return scaffoldConfig.stellar.horizonUrl;
}

export function getSorobanRpcUrl(): string {
  return scaffoldConfig.stellar.sorobanRpcUrl;
}

export function getNetworkPassphrase(): string {
  return scaffoldConfig.stellar.network === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";
}

// ── Contract simulation (read-only) ───────────────────────────

/**
 * Simulate a Soroban contract call without submitting a transaction.
 * Returns the decoded return value of the function.
 */
export async function simulateContractCall(
  contractId: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const { Contract, SorobanRpc, nativeToScVal, xdr } = await import("@stellar/stellar-sdk");

  const server = new SorobanRpc.Server(getSorobanRpcUrl(), { allowHttp: true });
  const contract = new Contract(contractId);

  // Convert JS args to Stellar XDR ScVals
  const scArgs = args.map((a) => jsArgToScVal(a, xdr, nativeToScVal));

  const op = contract.call(method, ...scArgs);

  // Use a dummy source account for simulation
  const { Account, TransactionBuilder, BASE_FEE } = await import("@stellar/stellar-sdk");
  const dummyAccount = new Account("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN", "0");

  const tx = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation error: ${simResult.error}`);
  }

  if (!SorobanRpc.Api.isSimulationSuccess(simResult) || !simResult.result) {
    return null;
  }

  // Decode the return value from XDR
  const { scValToNative } = await import("@stellar/stellar-sdk");
  return scValToNative(simResult.result.retval);
}

// ── Transaction submission ─────────────────────────────────────

/**
 * Build, simulate, sign via wallet, and submit a Soroban transaction.
 */
export async function submitContractTransaction(
  contractId: string,
  method: string,
  args: unknown[],
  callerPublicKey: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<TxResult> {
  const {
    Contract,
    SorobanRpc,
    TransactionBuilder,
    BASE_FEE,
    Account,
    nativeToScVal,
    xdr,
  } = await import("@stellar/stellar-sdk");

  const server = new SorobanRpc.Server(getSorobanRpcUrl(), { allowHttp: true });
  const contract = new Contract(contractId);
  const scArgs = args.map((a) => jsArgToScVal(a, xdr, nativeToScVal));
  const op = contract.call(method, ...scArgs);

  // Fetch source account sequence
  const account = await server.getAccount(callerPublicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  // Simulate to get footprint + fee
  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    return { hash: "", success: false, errorMessage: simResult.error };
  }

  const { assembleTransaction } = await import("@stellar/stellar-sdk/contract");
  const preparedTx = assembleTransaction(tx, simResult).build();

  // Sign via wallet connector
  const { signedTxXdr } = await signTransaction(preparedTx.toXDR());

  // Submit
  const { TransactionBuilder: TB } = await import("@stellar/stellar-sdk");
  const signedTx = TB.fromXDR(signedTxXdr, getNetworkPassphrase());
  const result = await server.sendTransaction(signedTx);

  if (result.status === "ERROR") {
    return { hash: result.hash, success: false, errorMessage: "Transaction failed" };
  }

  // Poll for confirmation
  let getResult = await server.getTransaction(result.hash);
  let attempts = 0;
  while (getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 20) {
    await new Promise((r) => setTimeout(r, 2000));
    getResult = await server.getTransaction(result.hash);
    attempts++;
  }

  const success = getResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS;
  return { hash: result.hash, success, errorMessage: success ? undefined : "Transaction timed out" };
}

// ── XDR conversion helper ──────────────────────────────────────

function jsArgToScVal(
  arg: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xdrNs: any,
  nativeToScVal: (val: unknown) => unknown,
): unknown {
  // For arrays of arrays (ticket numbers), convert recursively
  if (Array.isArray(arg)) {
    const ScVal = xdrNs.ScVal;
    return ScVal.scvVec(arg.map((item) => jsArgToScVal(item, xdrNs, nativeToScVal)));
  }
  return nativeToScVal(arg);
}
