import { PageMeta } from "@/components/PageMeta";
import { TermsScreen } from "@/components/TermsScreen";

export default function Terms() {
  return (
    <>
      <PageMeta
        title="Kullanım Şartları — 321guess"
        description="321guess'i kullanırken geçerli olan kurallar ve koşullar."
        path="/terms"
      />
      <TermsScreen />
    </>
  );
}
