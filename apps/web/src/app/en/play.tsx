import { PageMeta } from "@/components/PageMeta";
import { PlayScreen } from "@/components/PlayScreen";

export default function PlayRouteEn() {
  return (
    <>
      <PageMeta
        title="Play — 321guess"
        description="Play the football player guessing game with random club or country matchups."
        path="/en/play"
      />
      <PlayScreen />
    </>
  );
}
