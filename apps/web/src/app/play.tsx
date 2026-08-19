import { PageMeta } from "@/components/PageMeta";
import { PlayScreen } from "@/components/PlayScreen";

export default function PlayRoute() {
  return (
    <>
      <PageMeta
        title="Oyna — 321guess"
        description="Rastgele kulüp veya ülke eşleşmeleriyle futbolcu tahmin oyunu oyna."
        path="/play"
      />
      <PlayScreen />
    </>
  );
}
