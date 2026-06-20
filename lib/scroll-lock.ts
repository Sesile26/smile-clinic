/**
 * Body scroll lock with scrollbar-width compensation.
 *
 * Setting `overflow: hidden` on <body> removes the page's vertical scrollbar,
 * which widens the content area and makes the whole site "jump". We compensate
 * by adding a matching `padding-right` to <body> equal to the scrollbar width
 * (0 on overlay-scrollbar platforms, so it's a no-op there).
 *
 * A reference count lets several modals (or rapid open/close) share the lock
 * without stacking padding or unlocking too early — only the first lock applies
 * the styles and only the last unlock restores them. A sticky/fixed header that
 * lives inside <body> is compensated automatically by the body padding (it's in
 * normal flow), so no separate handling is needed.
 */

let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount > 1) return; // already locked by another modal

  const body = document.body;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  savedOverflow = body.style.overflow;
  savedPaddingRight = body.style.paddingRight;

  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbarWidth}px`;
  }
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined" || lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return; // still held by another modal

  const body = document.body;
  body.style.overflow = savedOverflow;
  body.style.paddingRight = savedPaddingRight;
}
