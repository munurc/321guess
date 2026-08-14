import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Settings } from "@321guess/core";

const SOUND_KEY = "321guess.settings.sound";
const HAPTICS_KEY = "321guess.settings.haptics";

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
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SOUND_KEY)
      .then((v) => {
        if (v !== null) setSoundEnabledState(v === "true");
      })
      .catch(() => {});
    AsyncStorage.getItem(HAPTICS_KEY)
      .then((v) => {
        if (v !== null) setHapticsEnabledState(v === "true");
      })
      .catch(() => {});
  }, []);

  function setSoundEnabled(v: boolean) {
    setSoundEnabledState(v);
    AsyncStorage.setItem(SOUND_KEY, String(v)).catch(() => {});
  }
  function setHapticsEnabled(v: boolean) {
    setHapticsEnabledState(v);
    AsyncStorage.setItem(HAPTICS_KEY, String(v)).catch(() => {});
  }

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
 * and OnlineScreen (reads soundEnabled for guess feedback). sound/haptics
 * persist across launches via AsyncStorage; `settings` (game mode/
 * difficulty/leagues) intentionally does not, matching its pre-existing
 * session-only behavior. */
export function useGameSettings(): GameSettingsContextValue {
  const ctx = useContext(GameSettingsContext);
  if (!ctx) throw new Error("useGameSettings must be used within GameSettingsProvider");
  return ctx;
}
