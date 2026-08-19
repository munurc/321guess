import { PageMeta } from "@/components/PageMeta";
import { SetupScreen } from "@/components/SetupScreen";

export default function HomeScreenEn() {
  return (
    <>
      <PageMeta
        title="Football Player Guessing Game — 321guess"
        description="Free football player guessing game. Two club badges or a flag + a badge appear — name a player who played for both. Play with a friend, no login, no download."
        path="/en"
      />
      <SetupScreen />
    </>
  );
}
