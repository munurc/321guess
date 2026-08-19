import { PageMeta } from "@/components/PageMeta";
import { PrivacyScreen } from "@/components/PrivacyScreen";

export default function PrivacyEn() {
  return (
    <>
      <PageMeta
        title="Privacy Policy — 321guess"
        description="Learn what data 321guess collects, why, and how to have it deleted."
        path="/en/privacy"
      />
      <PrivacyScreen />
    </>
  );
}
