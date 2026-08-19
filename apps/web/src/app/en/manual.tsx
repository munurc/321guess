import { ManualScreen } from "@/components/ManualScreen";
import { PageMeta } from "@/components/PageMeta";

export default function ManualScreenEn() {
  return (
    <>
      <PageMeta
        title="Manual Mode — Pick Your Own Teams | 321guess"
        description="Pick two clubs, or a country + a club, yourself, and find a player who played for both. 321guess's manual mode."
        path="/en/manual"
      />
      <ManualScreen />
    </>
  );
}
