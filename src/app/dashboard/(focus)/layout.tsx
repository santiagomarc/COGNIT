/**
 * Focus routes — study and quiz (§8).
 *
 * **No navigation chrome at all.** No rail, no header nav, no bottom bar. The
 * grade deck owns the bottom band, and on mobile it *is* the bottom chrome.
 *
 * This layout exists to say that structurally. Run 1 approximated it with a
 * `CHROMELESS_ROUTE` regex inside the dock component, which meant the dock was
 * still mounted, still ran its scroll listener, and still had to remember to
 * return `null` — and its Dashboard link, a plain `<Link>`, never called the
 * quiz's `requestQuit()` guard (F-01). A route group cannot forget.
 *
 * It also carries `#main-content`, so the skip link lands on the page body.
 * Exactly one element in the tree owns that id per render: this one, or the
 * shell's — never both, since a route resolves into one group only.
 */
export default function FocusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div id="main-content" role="main">
      {children}
    </div>
  );
}
