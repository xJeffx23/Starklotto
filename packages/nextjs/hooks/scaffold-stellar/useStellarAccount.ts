"use client";

// Mirrors useAccount() from @starknet-react/core but for Stellar/Freighter.
// Returns the connected public key and connection helpers.

import { useCallback, useEffect, useState } from "react";
import { stellarConnectors } from "~~/services/web3/stellar/connectors";

const STORAGE_KEY_PK = "stellar_public_key";
const STORAGE_KEY_CONNECTOR = "stellar_last_connector";

export interface StellarAccountState {
  address: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  connectorId: string | undefined;
  connect: (connectorId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
}

export function useStellarAccount(): StellarAccountState {
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [connectorId, setConnectorId] = useState<string | undefined>(undefined);
  const [isConnecting, setIsConnecting] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const storedPk = localStorage.getItem(STORAGE_KEY_PK);
    const storedConnector = localStorage.getItem(STORAGE_KEY_CONNECTOR);
    if (storedPk) {
      setAddress(storedPk);
      setConnectorId(storedConnector ?? "freighter");
    }
  }, []);

  const connect = useCallback(async (id = "freighter") => {
    const connector = stellarConnectors.find((c) => c.id === id);
    if (!connector) throw new Error(`Stellar connector "${id}" not found`);

    setIsConnecting(true);
    try {
      const { publicKey } = await connector.connect();
      setAddress(publicKey);
      setConnectorId(id);
      localStorage.setItem(STORAGE_KEY_PK, publicKey);
      localStorage.setItem(STORAGE_KEY_CONNECTOR, id);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const connector = stellarConnectors.find((c) => c.id === connectorId);
    if (connector) await connector.disconnect();
    setAddress(undefined);
    setConnectorId(undefined);
  }, [connectorId]);

  const signTransaction = useCallback(
    async (xdr: string) => {
      const connector = stellarConnectors.find((c) => c.id === connectorId);
      if (!connector) throw new Error("No Stellar wallet connected");
      return connector.signTransaction(xdr);
    },
    [connectorId],
  );

  return {
    address,
    isConnected: !!address,
    isConnecting,
    connectorId,
    connect,
    disconnect,
    signTransaction,
  };
}
