/**
 * The authenticated surfaces' ambient layer (Run 6, Phase 0).
 *
 * This is the CSS-only descendant of `LandingBackground`. It keeps that
 * component's monochromatic vocabulary — a low-opacity radial light field and
 * a fine grain — and drops everything that costs a frame: the O(n²) particle
 * network (~5,500 distance checks per frame), the three canvas wave ribbons,
 * and the cursor spotlight. That budget is fine for a landing page viewed for
 * twenty seconds and is not fine on a surface someone sits on for forty
 * minutes.
 *
 * What is left is two `background-image` paints on one element, declared in
 * `globals.css` under `.amb`. No canvas, no `requestAnimationFrame`, no
 * listeners, no state — so this stays a server component, and nothing here
 * animates, which is a stronger guarantee than respecting reduced motion.
 *
 * Mounted per route rather than in the root layout: `/study` and `/quiz` are a
 * single card on a flat ground, and an ambient field there would compete with
 * the one thing the user is reading (§8 — those routes carry no chrome at all).
 *
 * Stacking: `.amb` is `position: fixed; z-index: 0`, so whatever renders it
 * must give its content wrapper `position: relative` and a z-index above 0. A
 * negative z-index would put this behind the `body` background and it would
 * disappear entirely.
 */
export function AmbientField() {
  return <div aria-hidden="true" className="amb" />;
}
