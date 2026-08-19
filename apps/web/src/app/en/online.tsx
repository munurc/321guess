import { PageMeta } from "@/components/PageMeta";
import { OnlineScreen } from "@/components/OnlineScreen";

export default function OnlineRouteEn() {
  return (
    <>
      <PageMeta
        title="Daily Challenge — 321guess"
        description="Race the world with 5 new football questions every day, and climb the leaderboard."
        path="/en/online"
      />
      <OnlineScreen />
    </>
  );
}
