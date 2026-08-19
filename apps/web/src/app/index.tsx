import { PageMeta } from "@/components/PageMeta";
import { SetupScreen } from "@/components/SetupScreen";

export default function HomeScreen() {
  return (
    <>
      <PageMeta
        title="Futbolcu Tahmin Oyunu — 321guess"
        description="Ücretsiz futbolcu tahmin oyunu. İki kulüp logosu veya bir bayrak + bir logo gösterilir, iki takımda da oynamış futbolcuyu bul. Arkadaşınla ekran başında oyna."
        path="/"
      />
      <SetupScreen />
    </>
  );
}
