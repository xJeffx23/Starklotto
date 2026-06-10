"use client";

// ChainContext — global chain selector.
// Wrap your app with <ChainProvider> (add it to app/layout.tsx alongside other providers).
// Components read activeChain with useChainContext() to decide which hooks to use.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ChainId } from "~~/services/chain-adapter";

const STORAGE_KEY = "starklotto_active_chain";

interface ChainContextValue {
  activeChain: ChainId;
  setActiveChain: (chain: ChainId) => void;
  isStarknet: boolean;
  isStellar: boolean;
}

const ChainContext = createContext<ChainContextValue>({
  activeChain: "starknet",
  setActiveChain: () => {},
  isStarknet: true,
  isStellar: false,
});

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [activeChain, setActiveChainState] = useState<ChainId>("starknet");

  // Restore last selected chain from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ChainId | null;
    if (stored === "starknet" || stored === "stellar") {
      setActiveChainState(stored);
    }
  }, []);

  const setActiveChain = useCallback((chain: ChainId) => {
    setActiveChainState(chain);
    localStorage.setItem(STORAGE_KEY, chain);
  }, []);

  return (
    <ChainContext.Provider
      value={{
        activeChain,
        setActiveChain,
        isStarknet: activeChain === "starknet",
        isStellar: activeChain === "stellar",
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

export function useChainContext() {
  return useContext(ChainContext);
}
