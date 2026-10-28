import { useLocalSearchParams } from "expo-router";
import { PageMeta } from "@/components/PageMeta";
import { InviteScreen } from "@/components/InviteScreen";

export default function InviteRouteEn() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return (
    <>
      <PageMeta
        title="A friend challenged you on 321guess!"
        description="Answer the same football questions and compare scores. No sign-up, play right in your browser."
        path="/en/m"
        noindex
      />
      <InviteScreen code={code} />
    </>
  );
}
