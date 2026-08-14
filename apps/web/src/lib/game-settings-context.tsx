import { createContext, useContext, useState, type ReactNode } from "react";
import type { Settings } from "@321guess/core";

type GameSettingsContextValue = {
  settings: Settings | null;
  setSettings: (s: Settings) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
};

const GameSettingsContext = createContext<GameSettingsContextValue | null>(null);

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  return (
    <GameSettingsContext.Provider
      value={{ settings, setSettings, soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled }}
    >
      {children}
    </GameSettingsContext.Provider>
  );
}

/** Produces: { settings, setSettings, soundEnabled, setSoundEnabled,
 * hapticsEnabled, setHapticsEnabled }. Consumed by SetupScreen (writes
 * settings), PlayScreen (reads settings), ArenaPressable (reads
 * hapticsEnabled), the Settings screen (reads/writes sound + haptics),
 * and OnlineScreen (reads soundEnabled for guess feedback). */
export function useGameSettings(): GameSettingsContextValue {
  const ctx = useContext(GameSettingsContext);
  if (!ctx) throw new Error("useGameSettings must be used within GameSettingsProvider");
  return ctx;
}
