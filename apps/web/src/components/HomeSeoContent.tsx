import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Head from "expo-router/head";
import { useLocale } from "use-intl";
import type { AppLocale } from "@/i18n/messages";

type Copy = {
  h1: string;
  tagline: string;
  howToHeading: string;
  howToSteps: string[];
  faqHeading: string;
  faq: { q: string; a: string }[];
  genre: string;
  gameName: string;
};

const COPY: Record<AppLocale, Copy> = {
  tr: {
    h1: "Futbolcu Tahmin Oyunu",
    tagline: "İki takımda da forma giymiş futbolcuyu bulmaya çalış — arkadaşınla, tarayıcıda, kayıt olmadan.",
    howToHeading: "Nasıl Oynanır?",
    howToSteps: [
      "Oyun modunu seç: Kulüp × Kulüp veya Ülke × Kulüp.",
      "Zorluk ve dahil edilecek ligleri belirle.",
      "3-2-1 geri sayımı biter bitmez iki takımda da oynamış futbolcunun ismini söyle.",
    ],
    faqHeading: "Sıkça Sorulan Sorular",
    faq: [
      {
        q: "321guess futbolcu tahmin oyunu ücretsiz mi?",
        a: "Evet, tamamen ücretsiz. Kayıt olmadan, hiçbir uygulama indirmeden tarayıcıda oynayabilirsin.",
      },
      {
        q: "Kaç kişi oynayabilir?",
        a: "Ekran başında en az iki kişi öneririz. Bir kişi soruyu okur, diğerleri iki takımda da oynamış futbolcuyu tahmin eder. Tek başına da oynayabilirsin.",
      },
      {
        q: "Hangi ligler ve kulüpler var?",
        a: "Türkiye Süper Lig, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 ve daha fazlası. Ayarlar ekranından istediğin ligleri açıp kapatabilirsin.",
      },
      {
        q: "Ülke × Kulüp modu nedir?",
        a: "Bir bayrak ve bir kulüp logosu görürsün. O milliyetten olup o kulüpte oynamış bir futbolcunun ismini bulman gerekir.",
      },
      {
        q: "Cevaplar nasıl doğrulanıyor?",
        a: "Oyuncu verileri Wikidata'dan çekilir ve düzenli olarak güncellenir. Tur sonunda 'Cevabı Göster' ile doğru futbolcuları görebilirsin.",
      },
    ],
    genre: "Futbol Bilgi Yarışması",
    gameName: "321guess — Futbolcu Tahmin Oyunu",
  },
  en: {
    h1: "Football Player Guessing Game",
    tagline: "Name a player who played for both teams — local co-op, browser-based, no signup.",
    howToHeading: "How to Play",
    howToSteps: [
      "Pick a mode: Club × Club or Country × Club.",
      "Choose a difficulty and the leagues you want included.",
      "When the 3-2-1 countdown ends, name a player who played for both teams.",
    ],
    faqHeading: "Frequently Asked Questions",
    faq: [
      {
        q: "Is 321guess free to play?",
        a: "Yes, completely free. No signup, no app install — it runs in the browser.",
      },
      {
        q: "How many people can play?",
        a: "It's designed for two or more people around one screen. One reads the prompt, others race to name a player who played for both teams. Solo play works too.",
      },
      {
        q: "Which leagues and clubs are included?",
        a: "Turkish Süper Lig, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 and more. You can toggle any league on or off in the setup screen.",
      },
      {
        q: "What is Country × Club mode?",
        a: "You see a flag and a club badge. You need to name a player of that nationality who played for that club.",
      },
      {
        q: "How are answers verified?",
        a: "Player data comes from Wikidata and is refreshed regularly. Hit 'Show Answers' at the end of a round to see the valid players.",
      },
    ],
    genre: "Football Trivia",
    gameName: "321guess — Football Player Guessing Game",
  },
};

/** Web-only homepage SEO content, ported from the retired Next.js site (H1
 * + tagline + How-to + FAQ + matching JSON-LD schemas). Locale-aware — the
 * "/en" route tree (src/app/en/) renders this under an English AppLocale,
 * so the copy switches with it rather than staying fixed like PageMeta's
 * per-call-site strings. Rendered only from index.tsx's web branch. */
export function HomeHeading() {
  const locale = useLocale() as AppLocale;
  const c = COPY[locale];
  return (
    <View className="mb-8">
      <Text accessibilityRole="header" className="text-2xl font-black text-ink">
        {c.h1}
      </Text>
      <Text className="mt-2 text-sm text-ink-mute">{c.tagline}</Text>
    </View>
  );
}

export function HomeSeoSections() {
  const locale = useLocale() as AppLocale;
  const c = COPY[locale];
  const siteUrl = "https://www.321guess.com";
  const pageUrl = locale === "en" ? `${siteUrl}/en` : siteUrl;
  const inLanguage = locale === "tr" ? "tr-TR" : "en-US";

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "321guess",
      url: siteUrl,
      inLanguage,
      description: c.tagline,
    },
    {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: c.gameName,
      url: pageUrl,
      description: c.tagline,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      genre: c.genre,
      inLanguage: [inLanguage],
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: c.howToHeading,
      description: c.tagline,
      step: c.howToSteps.map((text, idx) => ({
        "@type": "HowToStep",
        position: idx + 1,
        name: text,
        text,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: c.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];

  return (
    <View className="mt-8 gap-8">
      <Head>
        {/* react-helmet-async reads a script tag's content from its JSX
         * children (not dangerouslySetInnerHTML) to build the tag it
         * injects into <head> — see mapNestedChildrenToProps in
         * vendor/react-helmet-async. */}
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
      </Head>

      <View>
        <Text className="mb-3 text-lg font-bold text-ink">{c.howToHeading}</Text>
        <View className="gap-2">
          {c.howToSteps.map((step, idx) => (
            <View key={idx} className="flex-row gap-2">
              <Text className="text-sm font-semibold text-accent">{idx + 1}.</Text>
              <Text className="flex-1 text-sm text-ink-soft">{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View>
        <Text className="mb-3 text-lg font-bold text-ink">{c.faqHeading}</Text>
        <View className="gap-2">
          {c.faq.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </View>
      </View>
    </View>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} className="rounded-lg border border-rule bg-ink/5 p-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm font-semibold text-ink">{q}</Text>
        <Text className="text-accent">{open ? "−" : "+"}</Text>
      </View>
      {open && <Text className="mt-2 text-sm leading-5 text-ink-mute">{a}</Text>}
    </Pressable>
  );
}
