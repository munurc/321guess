import en from "../locales/en.json";
import tr from "../locales/tr.json";

export const messages = { en, tr } as const;
export type AppLocale = keyof typeof messages;
export const defaultLocale: AppLocale = "tr";
