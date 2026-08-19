import { PageMeta } from "@/components/PageMeta";
import { TermsScreen } from "@/components/TermsScreen";

export default function TermsEn() {
  return (
    <>
      <PageMeta
        title="Terms of Use — 321guess"
        description="The rules and conditions that apply while using 321guess."
        path="/en/terms"
      />
      <TermsScreen />
    </>
  );
}
