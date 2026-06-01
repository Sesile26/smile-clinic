/**
 * Shared button class strings mirroring the mockup `.btn` variants.
 * Compose with cn(): cn(btnBase, btnMint).
 */
export const btnBase =
  "inline-flex items-center gap-2.5 rounded-full px-[22px] py-3.5 text-[15px] font-medium tracking-[-0.005em] whitespace-nowrap transition-[transform,background,color,box-shadow] duration-200 ease-smooth";

export const btnPrimary =
  "bg-navy-900 text-white shadow-[0_1px_0_rgba(255,255,255,.1)_inset,0_8px_24px_-10px_rgba(10,22,40,.35)] hover:bg-black hover:-translate-y-px";

export const btnMint =
  "bg-mint text-navy-900 shadow-[0_8px_22px_-8px_rgba(0,201,167,.55),0_1px_0_rgba(255,255,255,.4)_inset] hover:bg-mint-600 hover:-translate-y-px";

export const btnGhost =
  "border border-[color:var(--line-2)] bg-transparent text-navy-900 hover:border-navy-900 hover:bg-navy-900 hover:text-white";

export const btnLink =
  "inline-flex items-center gap-2 rounded-none border-b border-navy-900 px-0 py-2.5 font-medium text-navy-900 hover:border-mint-600 hover:text-mint-600";
