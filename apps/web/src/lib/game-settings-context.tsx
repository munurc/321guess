import { createContext, useContext, useState, type ReactNode } from "react";
import type { Settings } from "@321guess/core";

type GameSettingsContextValue = { settings: Settings | null; setSettings: (s: Settings) => void };

const GameSettingsContext = createContext<GameSettingsContextValue | null>(null);

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  return (
    <GameSettingsContext.Provider value={{ settings, setSettings }}>{children}</GameSettingsContext.Provider>
  );
}

/** Produces: { settings: Settings | null, setSettings: (s: Settings) => void }.
 * Consumed by SetupScreen (writes) and PlayScreen (reads). */
export function useGameSettings(): GameSettingsContextValue {
  const ctx = useContext(GameSettingsContext);
  if (!ctx) throw new Error("useGameSettings must be used within GameSettingsProvider");
  return ctx;
}
