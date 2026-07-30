import { setRequestLocale, getTranslations } from "next-intl/server";
import { SetupScreen } from "@/components/SetupScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tMeta = await getTranslations({ locale, namespace: "meta" });

  const howToSteps = t.raw("howToSteps") as string[];
  const faq = t.raw("faq") as { q: string; a: string }[];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "321guess",
      url: "https://321guess.com",
      inLanguage: locale === "tr" ? "tr-TR" : "en-US",
      description: tMeta("description"),
    },
    {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: tMeta("title"),
      url: `https://321guess.com/${locale}`,
      description: t("intro"),
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      genre: locale === "tr" ? "Futbol Bilgi Yarışması" : "Football Trivia",
      inLanguage: [locale === "tr" ? "tr-TR" : "en-US"],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: t("howToHeading"),
      description: t("intro"),
      step: howToSteps.map((text, idx) => ({
        "@type": "HowToStep",
        position: idx + 1,
        name: text,
        text,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];

  return (
    <main>
      <section className="mx-auto max-w-5xl px-4 pt-8 sm:pt-14">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
          {t("h1")}
        </h1>
        <p className="mt-3 max-w-2xl text-base sm:text-lg text-ink/70">
          {t("tagline")}
        </p>
      </section>

      <SetupScreen />

      <section
        className="mx-auto max-w-5xl px-4 pb-4"
        aria-labelledby="how-to-heading"
      >
        <h2
          id="how-to-heading"
          className="mb-4 text-xl sm:text-2xl font-bold tracking-tight"
        >
          {t("howToHeading")}
        </h2>
        <ol className="list-decimal space-y-2 pl-6 text-ink/80">
          {howToSteps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </section>

      <section
        className="mx-auto max-w-5xl px-4 py-10"
        aria-labelledby="faq-heading"
      >
        <h2
          id="faq-heading"
          className="mb-4 text-xl sm:text-2xl font-bold tracking-tight"
        >
          {t("faqHeading")}
        </h2>
        <div className="space-y-3">
          {faq.map((item, idx) => (
            <details
              key={idx}
              className="group rounded-lg border border-ink/10 bg-ink/5 p-4"
            >
              <summary className="cursor-pointer list-none font-semibold text-ink/90 marker:hidden">
                <span className="mr-2 text-accent">+</span>
                {item.q}
              </summary>
              <p className="mt-2 pl-6 text-ink/70">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mx-auto max-w-5xl px-4 pb-6 text-sm text-ink/50">
        {t("intro")}
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
