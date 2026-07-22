import { setRequestLocale } from "next-intl/server";
import { ManualScreen } from "@/components/ManualScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ManualScreen />;
}
