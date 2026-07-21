import { setRequestLocale } from "next-intl/server";
import { PlayScreen } from "@/components/PlayScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlayScreen />;
}
