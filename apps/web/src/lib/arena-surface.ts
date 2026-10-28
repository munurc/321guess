import { createContext, useContext } from "react";
import { Platform } from "react-native";

/** When true, components that normally switch to the light web styling on
 * web (LogoTile, GuessInput) keep their arena/app look instead. Set by
 * screens that use the arena theme on every platform, e.g. the /m/[code]
 * invite flow. Defaults to false so the rest of the website is unchanged. */
export const ArenaSurfaceContext = createContext(false);

/** True on native, and on web inside an ArenaSurfaceContext provider. */
export function useArenaStyling(): boolean {
  const forced = useContext(ArenaSurfaceContext);
  return Platform.OS !== "web" || forced;
}
