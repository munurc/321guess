export type TargetLeague = {
  qid: string;
  slug: string;
  countryCodeHint: string;
  displayName?: string;
};

// NOTE: Q IDs verified against wikidata.org labels. If a league query returns
// zero clubs, verify the QID at https://www.wikidata.org/wiki/QXXXX and update here.
export const targetLeagues: TargetLeague[] = [
  { qid: "Q9448",     slug: "premier-league",   countryCodeHint: "GB", displayName: "Premier League" },
  { qid: "Q324867",   slug: "la-liga",          countryCodeHint: "ES", displayName: "La Liga" },
  { qid: "Q15804",    slug: "serie-a",          countryCodeHint: "IT", displayName: "Serie A" },
  { qid: "Q82595",    slug: "bundesliga",       countryCodeHint: "DE", displayName: "Bundesliga" },
  { qid: "Q13394",    slug: "ligue-1",          countryCodeHint: "FR", displayName: "Ligue 1" },
  { qid: "Q485568",   slug: "super-lig",        countryCodeHint: "TR", displayName: "Süper Lig" },
  { qid: "Q167541",   slug: "eredivisie",       countryCodeHint: "NL", displayName: "Eredivisie" },
  { qid: "Q182994",   slug: "primeira-liga",    countryCodeHint: "PT", displayName: "Liga Portugal" },
  { qid: "Q216022",   slug: "belgian-pro",      countryCodeHint: "BE", displayName: "Belgian Pro League" },
  { qid: "Q14377162", slug: "scottish-prem",    countryCodeHint: "GB", displayName: "Scottish Premiership" },
  { qid: "Q206813",   slug: "brasileirao",      countryCodeHint: "BR", displayName: "Brasileirão Série A" },
  { qid: "Q223170",   slug: "primera-arg",      countryCodeHint: "AR", displayName: "Primera División (Arg)" },
  { qid: "Q18543",    slug: "mls",              countryCodeHint: "US", displayName: "Major League Soccer" },
  { qid: "Q764690",   slug: "liga-mx",          countryCodeHint: "MX", displayName: "Liga MX" },
  { qid: "Q255633",   slug: "saudi-pro",        countryCodeHint: "SA", displayName: "Saudi Pro League" },
];
