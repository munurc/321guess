"use client";

type LogoTileProps = {
  src: string;
  alt: string;
  caption: string;
  variant?: "logo" | "flag";
};

export function LogoTile({ src, alt, caption, variant = "logo" }: LogoTileProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`grid aspect-square w-40 place-items-center rounded-2xl border border-rule bg-paper-2 p-6 shadow-md shadow-ink/10 sm:w-56 lg:w-72 ${
          variant === "flag" ? "overflow-hidden !p-0" : ""
        }`}
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
      <div className="max-w-[16rem] text-center text-sm font-medium text-ink/70">
        {caption}
      </div>
    </div>
  );
}
