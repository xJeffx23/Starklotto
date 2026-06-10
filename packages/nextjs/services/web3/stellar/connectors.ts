// Stellar wallet connectors.
// Mirrors the pattern of services/web3/connectors.tsx but for Stellar wallets.
//
// Install dependency before using:
//   yarn workspace @ss-2/nextjs add @stellar/freighter-api

import scaffoldConfig from "~~/scaffold.config";

export interface StellarConnector {
  id: string;
  name: string;
  iconUrl: string;
  isAvailable: () => Promise<boolean>;
  connect: () => Promise<{ publicKey: string }>;
  disconnect: () => Promise<void>;
  getPublicKey: () => Promise<string>;
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
}

// ── Freighter ─────────────────────────────────────────────────
// Install: yarn workspace @ss-2/nextjs add @stellar/freighter-api
function createFreighterConnector(): StellarConnector {
  return {
    id: "freighter",
    name: "Freighter",
    iconUrl: "/icons/freighter.svg",

    async isAvailable() {
      if (typeof window === "undefined") return false;
      try {
        // Dynamic import keeps bundle lean when Freighter isn't installed
        const { isConnected } = await import("@stellar/freighter-api");
        const result = await isConnected();
        return result.isConnected;
      } catch {
        return false;
      }
    },

    async connect() {
      const { requestAccess } = await import("@stellar/freighter-api");
      const result = await requestAccess();
      if (result.error) throw new Error(result.error);
      return { publicKey: result.publicKey };
    },

    async disconnect() {
      localStorage.removeItem("stellar_last_connector");
      localStorage.removeItem("stellar_public_key");
    },

    async getPublicKey() {
      const { getPublicKey } = await import("@stellar/freighter-api");
      const result = await getPublicKey();
      if (result.error) throw new Error(result.error);
      return result.publicKey;
    },

    async signTransaction(xdr: string) {
      const { signTransaction } = await import("@stellar/freighter-api");
      const network = scaffoldConfig.stellar.network === "mainnet" ? "PUBLIC" : "TESTNET";
      const result = await signTransaction(xdr, { network });
      if (result.error) throw new Error(result.error);
      return { signedTxXdr: result.signedTxXdr };
    },
  };
}

// ── Albedo (browser-based, no extension needed) ────────────────
// Install: yarn workspace @ss-2/nextjs add albedo-link
function createAlbedoConnector(): StellarConnector {
  return {
    id: "albedo",
    name: "Albedo",
    iconUrl: "/icons/albedo.svg",

    async isAvailable() {
      return typeof window !== "undefined"; // always available (opens popup)
    },

    async connect() {
      const albedo = await import("albedo-link");
      const result = await albedo.default.publicKey({ require_existing: false });
      return { publicKey: result.pubkey };
    },

    async disconnect() {
      localStorage.removeItem("stellar_last_connector");
      localStorage.removeItem("stellar_public_key");
    },

    async getPublicKey() {
      const albedo = await import("albedo-link");
      const result = await albedo.default.publicKey({ require_existing: true });
      return result.pubkey;
    },

    async signTransaction(xdr: string) {
      const albedo = await import("albedo-link");
      const network = scaffoldConfig.stellar.network === "mainnet" ? "public" : "testnet";
      const result = await albedo.default.tx({ xdr, network, submit: false });
      return { signedTxXdr: result.signed_envelope_xdr };
    },
  };
}

export const stellarConnectors: StellarConnector[] = [
  createFreighterConnector(),
  createAlbedoConnector(),
];

export const freighterConnector = stellarConnectors[0];
export const albedoConnector = stellarConnectors[1];
