import "server-only";
import { locales, defaultLocale, type Locale } from "./locales";

export { locales, defaultLocale, type Locale };

const dictionaries = {
  ko: () => import("./dictionaries/ko.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<typeof dictionaries.ko>>;

export const getDictionary = async (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();
