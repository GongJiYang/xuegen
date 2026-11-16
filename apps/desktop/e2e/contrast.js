/* global document, getComputedStyle, innerHeight */
// Evaluated in the page by `proof.mjs contrast`: every visible element with its
// own text whose colour against its background is below 4.5:1 (WCAG AA), the
// lowest first. Returns [ratio, tag, class, text, colour, background] rows.
const parse = (c) => c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
const lum = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const bgOf = (e) => {
  for (let n = e; n; n = n.parentElement) {
    const c = parse(getComputedStyle(n).backgroundColor);
    if (c.length < 4 || c[3] > 0.5) return c;
  }
  return [255, 255, 255];
};
const out = [];
const seen = new Set();
for (const e of document.querySelectorAll("body *")) {
  const s = getComputedStyle(e);
  if (!e.offsetParent && s.position !== "fixed") continue;
  if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
  const r = e.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
  if (s.visibility === "hidden" || +s.opacity === 0 || e.closest("[aria-hidden=true], :disabled, [aria-disabled=true]")) continue;
  const fg = parse(s.color);
  const bg = bgOf(e);
  const a = fg.length > 3 ? fg[3] : 1;
  const mix = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
  const [l1, l2] = [lum(mix), lum(bg)];
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const key = e.className + "|" + s.color;
  if (ratio >= 4.5 || seen.has(key)) continue;
  seen.add(key);
  out.push([+ratio.toFixed(2), e.tagName, String(e.className).slice(0, 40), e.textContent.trim().slice(0, 18), s.color, `rgb(${bg.slice(0, 3).join(",")})`]);
}
return out.sort((a, b) => a[0] - b[0]).slice(0, 40);
