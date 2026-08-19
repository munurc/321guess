import { PageMeta } from "@/components/PageMeta";
import { OnlineScreen } from "@/components/OnlineScreen";

export default function OnlineRoute() {
  return (
    <>
      <PageMeta
        title="Günlük Meydan Okuma — 321guess"
        description="Her gün değişen 5 soruyla futbol bilgini dünyayla yarıştır, liderlik tablosunda yerini al."
        path="/online"
      />
      <OnlineScreen />
    </>
  );
}
