import { ManualScreen } from "@/components/ManualScreen";
import { PageMeta } from "@/components/PageMeta";

export default function HomeScreen() {
  return (
    <>
      <PageMeta
        title="Manuel Oyun — İki Takımı Kendin Seç | 321guess"
        description="İki kulübü ya da bir ülke + kulübü kendin seç, iki takımda da oynamış futbolcuyu bul. 321guess'in manuel modu."
        path="/manual"
      />
      <ManualScreen />
    </>
  );
}
