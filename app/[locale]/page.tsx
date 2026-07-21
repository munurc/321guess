import { setRequestLocale } from "next-intl/server";
import { SetupScreen } from "@/components/SetupScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SetupScreen />;
}
