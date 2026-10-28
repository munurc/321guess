import { useLocalSearchParams } from "expo-router";
import { PageMeta } from "@/components/PageMeta";
import { InviteScreen } from "@/components/InviteScreen";

export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return (
    <>
      <PageMeta
        title="Arkadaşın seni 321guess'te meydan okumaya davet etti!"
        description="Aynı futbol sorularını çöz, skorunu karşılaştır. Kayıt yok, hemen tarayıcıda oyna."
        path="/m"
        noindex
      />
      <InviteScreen code={code} />
    </>
  );
}
