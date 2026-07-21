export type Country = {
  code: string;
  nameTr: string;
  nameEn: string;
  flagUrl: string;
};

export type League = {
  id: string;
  nameTr: string;
  nameEn: string;
  countryCode: string;
};

export type Club = {
  id: string;
  name: string;
  logoUrl: string;
  leagueId: string;
  countryCode: string;
  /** Wikidata sitelink count — proxy for how famous the club is (higher = more famous). */
  popularity: number;
};

export type Player = {
  id: string;
  name: string;
  nationalityCode: string;
  clubIds: string[];
};

export type GameMode = "clubClub" | "countryClub";
export type Difficulty = "easy" | "medium" | "hard";

export type Settings = {
  mode: GameMode;
  difficulty: Difficulty;
  includedLeagues: string[];
  excludedCountries: string[];
};

export type ClubClubRound = {
  kind: "clubClub";
  clubA: Club;
  clubB: Club;
  correctPlayers: Player[];
};

export type CountryClubRound = {
  kind: "countryClub";
  country: Country;
  club: Club;
  correctPlayers: Player[];
};

export type Round = ClubClubRound | CountryClubRound;

export type Dataset = {
  countries: Country[];
  leagues: League[];
  clubs: Club[];
  players: Player[];
};
