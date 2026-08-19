import { PageMeta } from "@/components/PageMeta";
import { PrivacyScreen } from "@/components/PrivacyScreen";

export default function Privacy() {
  return (
    <>
      <PageMeta
        title="Gizlilik Politikası — 321guess"
        description="321guess'in hangi verileri topladığını, neden topladığını ve verilerini nasıl silebileceğini öğren."
        path="/privacy"
      />
      <PrivacyScreen />
    </>
  );
}
