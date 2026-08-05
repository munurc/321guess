import { setRequestLocale } from "next-intl/server";
import { OnlineScreen } from "@/components/OnlineScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OnlineScreen />;
}
