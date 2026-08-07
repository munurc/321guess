"use client";

type LogoTileProps = {
  src: string;
  alt: string;
  caption: string;
  variant?: "logo" | "flag";
  /** "lg" is the original reveal-screen size; "sm" fits inside a denser
   * layout (e.g. the online mode's in-progress question card). */
  size?: "lg" | "sm";
};

export function LogoTile({ src, alt, caption, variant = "logo", size = "lg" }: LogoTileProps) {
  const isSmall = size === "sm";
  return (
    <div className={`flex flex-col items-center ${isSmall ? "gap-1.5" : "gap-3"}`}>
      <div
        className={`grid aspect-square place-items-center rounded-2xl border border-rule bg-paper-2 shadow-md shadow-ink/10 ${
          isSmall ? "w-14 p-2 sm:w-16" : "w-40 p-6 sm:w-56 lg:w-72"
        } ${variant === "flag" ? "overflow-hidden !p-0" : ""}`}
      >
        <img
          src={`${src}?width=400`}
          alt={alt}
          className={
            variant === "flag"
              ? "h-full w-full object-cover"
              : "max-h-full max-w-full object-contain"
          }
          loading="eager"
        />
      </div>
      <div
        className={`text-center font-medium text-ink/70 ${
          isSmall ? "max-w-[5.5rem] text-[11px] leading-tight" : "max-w-[16rem] text-sm"
        }`}
      >
        {caption}
      </div>
    </div>
  );
}
