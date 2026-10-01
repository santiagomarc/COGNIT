# Cognit — UI/UX Plan

**Revision:** 1.0 · 2026-10-01.
**Baseline:** `main` @ `bc66b1d` (re-checked at the end of the audit: no new commits; untracked `COGNIT_SIDEBAR_SETTINGS_PLAN.md` and `COGNIT_UIUX_PLAN_PROMPT.md` only).
**Scope:** an audit of Cognit's UI and UX, seen running where the session could see it and read from code where it could not, and the phased plan that follows. No code was changed.
**Companions:** `COGNIT_DESIGN_SYSTEM.md` (Rev. D; this plan proposes **Rev. F**, §9, on top of the sidebar plan's Rev. E) · `COGNIT_SIDEBAR_SETTINGS_PLAN.md` (Rev 1.0, approved 2026-09-30, not yet executed; called **SSP** below) · `COGNIT_NEXT_HORIZON_PLAN.md` (Rev 1.4; house style, finding IDs, §7 standing rules).

---

## How to read this document

- **§0** is the one-page answer. **§1** holds the findings, the seed verdicts, what is verified good, the competitor comparison and what could not be checked. **§2** is the roadmap and how it interleaves with SSP. **§3–§8** are the phases, each ending in a gate. **§9** is the design-system revision. **§10** lists the owner's decisions, **§11** what is out of scope. Appendices hold the evidence and the scripts.
- Finding IDs continue the Next Horizon series (**UX-06…, A11Y-12…, MOB-05…, DS-08…, PERF-06…**) and add **FLOW** (a journey that fails its purpose), **COPY** (words that mislead), **VIS** (design-system visuals) and **TEST** (the harness). None collides with Next Horizon or SSP IDs (DATA, DST, SET, NAV, DSR).
- Severity: **S0** blocks use or loses data · **S1** user-visible defect, or a flow that fails its purpose · **S2** quality, accessibility or consistency debt · **S3** polish.
- Every `file:line` refers to `bc66b1d`.
- **Code in this plan is a sketch** against `bc66b1d`: none of it has been compiled or run (this session changed nothing). The tests named beside each item are the contract; where a sketch and its test disagree, the test wins.

### Evidence standard

| Question | Method |
|---|---|
| Does it build, and what ships? | APFS clone of `bc66b1d` → `EXPLORE_ENABLED=true next build` ✓ → `node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json`: all ten budgeted routes within budget (Appendix C.3). |
| What do the public surfaces look like? | `next start -p 3100` from the clone; Playwright (`playwright-core` + system Chrome, headless) captured `/`, `/login`, `/login?mode=signup`, `/login/update-password`, `/explore`, the 404 page, a missing share link and a signed-out `/dashboard` at **375, 768 and 1280 px in light and dark**: 44 captures, plus 3 landing variants and 8 card-fit renders (Appendix A). |
| Accessibility | `@axe-core/playwright` (axe-core 4.x; tags `wcag2a/aa`, `wcag21a/aa`, `wcag22aa`, `best-practice`) at 375 and 1280 px in both themes on every public surface (Appendix B). Touch targets measured by bounding box at 375 px (Appendix B.2). The study card's accessible name was read from Chrome's accessibility tree over the exact markup `FlipCard` renders. |
| The study canvas on a phone | The study page's markup, reconstructed from `FlashcardReviewClient.tsx`, rendered inside a live page so the production CSS and the `next/font` faces apply; card text measured at 375×667, 375×812, 768×1024 and 1280×800 for four prompt lengths, before and after the proposed type steps (Appendix C.1). |
| How long does a grade take? | The card's enter/exit spring run through **framer-motion 12.34.3's own `spring` generator** (the version in `package-lock.json`), plus the CSS durations in `globals.css` (Appendix C.2). |
| Production | `curl` timings and headers against https://cognit-nine.vercel.app (Appendix C.4). |
| **What could not be verified** | **Every signed-in screen, live.** The owner was asked at the start for a test account in `.env.local` (`LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD`); the keys never appeared, and this session does not create accounts in production. Signed-in findings are therefore **read from code** and marked *code* in the evidence column, each with the check that confirms it. Also not available: a real iPhone or Android device, VoiceOver or NVDA, and usage data (there is none: no analytics exist, and production holds a handful of decks). The scripts in Appendix D run the missing checks as soon as the keys exist. |

---

## 0. Executive summary

**Verdict.** The visual system is disciplined and mostly honoured: the public surfaces pass axe's colour-contrast and ARIA rules in both themes, bundles sit inside their budgets, the design system's anti-patterns are gone from the app's chrome, and the onboarding's starter decks put a new user one click from their first review. What falls short is **the study loop itself**, the screen a user spends 40 minutes on. On a phone, a typical AI-written prompt doesn't fit the card. A screen reader can't read the card. A mis-pressed grade can't be undone. "Start session" quietly studies 10 cards of one deck while the band above it promises every due card. And every grade waits almost a second on animation. Around the loop, a few things undercut the product's own thesis of an instrument you can trust: invented user counts on the landing page, gamified quiz badges, three different meanings of "Retention", and day boundaries in UTC.

**Top five problems**

| # | Finding | Why it matters |
|---|---|---|
| 1 | **UX-07 (S1)** A 1–3-sentence prompt, the length the PDF generator is told to write, renders at **37.6 px serif on a 375 px phone: 13 lines, 6 visible, 308 px hidden** in an inner scroll with no cue (measured). The starter deck's longest card already overflows. | The card is the product. Most AI-written prompts can't be read without discovering a hidden scroll. |
| 2 | **A11Y-13 (S1)** The study card is a `<button>` whose `aria-label` ("Showing the question. Press to reveal the answer.") **is its accessible name**; the question and answer text are not in it (Chrome AX tree, measured). The live region says only "Card 3 of 10". | A screen-reader user hears instructions but never the card. The core loop is closed to them. |
| 3 | **FLOW-01 (S1)** Today reports "47 cards due across 3 decks · est. 8 min", then **Start session** opens a **10-card** session of one deck (`DEFAULT_SESSION_CARD_COUNT = 10`), which ends on "Review complete" with no way on to the rest. | The daily-return journey doesn't do what the screen says. The user has to find the next chunk and the next deck by hand, again and again. |
| 4 | **FLOW-03 (S1)** **No undo for a grade.** One slip onto `1` resets a mature card's interval and permanently lowers its ease. Anki and RemNote both undo. | 50 grades a session by keyboard makes slips certain, and the cost lasts months. |
| 5 | **COPY-01 (S1)** The landing page shows **"10,000+ Active students · 2,000,000+ Cards studied · 4.9 Average rating"**. None of it is read from anything (the component's own comment says so), and it claims "flashcards in 30 seconds" and "any format". | A product whose thesis is *trustworthy* opens with invented numbers. It's also a consumer-protection risk. |

Close behind: **PERF-06** (≈0.9 s from a grade to the next readable prompt; about a minute of every 50-card session is spent waiting on animation), **FLOW-05** (signing up from a share link loses the deck the visitor came to save), **UX-06** (streak, "reviewed today", heatmap and forecast all cut days at UTC midnight, which is 08:00 for a user in UTC+8), and **VIS-01** ("Flawless Victory" and "Speed Demon" badges on the quiz result).

**Roadmap**

| Phase | Goal | Size | Exit gate |
|---|---|---|---|
| **U0** | Trust hotfixes that need no harness: invented stats, the swapped PDF preview labels, the signup redirect, dead links, link unfurls | 0.5–1 day | GU0 (§3.6) |
| **U1** | The UI test harness: Playwright + axe + a seeded fixture account, a CI job against a local Supabase, and budgets for touch targets and study latency | 2.5 days | GU1 (§4.6) |
| **U2** | The study loop: readable card on every screen, a card a screen reader can read, honest sessions that keep going, undo, fast transitions, edit in place, swipe that says what it does | 7–8 days | GU2 (§5.10) |
| **U3** | Today and the words: local days, one meaning per word, onboarding, an honest PDF wait, consistent undo, card search | 5–6 days | GU3 (§6.8) |
| **U4** | Design-system conformance: type utilities (S1), display steps (S2), gamification and tilt out, planes on result screens, touch targets, landmarks | 3–3.5 days | GU4 (§7.8) |
| **U5** | Measurement: Web Vitals and a funnel, first-party, CSP-safe | 1.5 days | GU5 (§8.4) |

About **19.5–22.5 days** in all. SSP is another 9–12 and is independent except where §2.2 says otherwise. Recommended order: **U0 → U1 → SSP 0–1 → U2 → SSP 2–3 → U3 → U4 → U5** (§2.2 argues it; §10 OD-1 lets the owner reorder).

---

## 1. Findings

### 1.1 The seed findings (S1–S8): verdicts

Each seed was re-checked against `bc66b1d` (no commits landed during the audit).

| Seed | Verdict | Now | What changed |
|---|---|---|---|
| **S1** Type tokens without utilities | **Kept, corrected** | **DS-08** | Counts re-measured: **282** `text-[Npx]` (seed 281): 144 × 10 px, 91 × 13 px, 18 × 12 px, 8 × 11 px, 7 × 15 px. The label style appears in **140** class strings containing all four of `font-mono`, `text-[10px]`, `uppercase`, `tracking-[0.16em]` (seed 139), across **65 files**, and **17 files** each declare their own `const LABEL = '…'` copy. **173** arbitrary `h-/w-/min-/max-[Npx]` classes, as seeded. Severity lowered to S2: it slows every UI change and invites drift, but no user sees it directly. |
| **S2** DS-05 remainder | **Kept, corrected** | **DS-09** | The seed's list is incomplete, and one item is dead code. Also off the scale: the MCQ and identification prompts (`clamp(2.1rem, 3.3vw, 2.85rem)`, `MCQMode.tsx:169`, `IdentificationMode.tsx:109`), the landing hero (`clamp(4.125rem, 7.5vw, 6.75rem)`, `HeroSection.tsx:105`) and two landing section heads (`clamp(3rem, 4.5vw, 3.75rem)`, `HowItWorks.tsx:43`, `FeatureGrid.tsx:64`). `Wordmark` `xl` and `2xl` have **zero consumers** (only `sm` ×2, `md` and `lg` are used), so they are deleted, not given steps. The study card's own size is a separate, larger problem (UX-07). Recommendations in §9.2; decision OD-2. |
| **S3** A11Y-01 leftover | **Kept, widened** | **A11Y-12** | Still `<main>` inside the focus layout's `role="main"`: `MCQMode.tsx:158`, `IdentificationMode.tsx:98`, `synthesis/loading.tsx:24`. Also, measured: `/`, `/login`, `/login/update-password`, the 404 page and `/s/<token>` have **no main landmark at all**, and the root skip link points at `#main-content`, which doesn't exist on four of them (axe `landmark-one-main`, `skip-link`, `region` on 7 of 8 public surfaces). |
| **S4** Three ~1,000-line clients | **Kept, narrowed** | **REF-01** | Line counts confirmed (1,081 / 1,050 / 995). Split **only `FlashcardReviewClient`**, as step 1 of U2, because U2 rewrites its behaviour anyway (undo, continuation, latency, a11y). Splitting the quiz and drill clients now would be refactoring without a user-visible change behind it; do each when its own UX work arrives. Sized in §5.1. |
| **S5** No UI test harness | **Kept** | **TEST-01** | Confirmed: `package.json` has no Playwright or Testing Library; every test runs in Vitest's `node` environment. U1 builds it, and argues why it comes first (§4). |
| **S6** PDF generation wait | **Kept, extended** | **FLOW-06** | Confirmed (`PDFUploadZone.tsx:276–300`). Added from code: nothing guards navigation during generation; enrichment (MCQ distractors, identification questions) is fired **by the client after success** (`:154–159`), so a user who leaves mid-generation gets saved cards that aren't quiz-ready until a quiz triggers enrichment itself; there's no cancel; "usually takes under a minute" sits beside a landing claim of "30 seconds" and an onboarding estimate of "~30s", against a measured 2–61 s per call and a 48 s budget. Leaving mid-generation could not be tested live (no account); §6.4 gives the check. |
| **S7** Missing loading states | **Kept, extended** | **PERF-08** | Confirmed: no `loading.tsx` under `src/app/s/[token]/` or `src/app/explore/`. Added: `generateMetadata` and the page both run the same `decks` query for a share link (`s/[token]/page.tsx:31` and `:61`), and the page also calls `getSessionUser()` for anonymous visitors (`:84`). Measured on production: a missing share link answers in **0.50–1.20 s** (TTFB) and `/explore` in **0.36–1.12 s**. S3. |
| **S8** No real-user metrics | **Kept** | **PERF-09** | Confirmed: no Web Vitals reporting, no RUM, no product analytics. `logger.ts` is console-only and its comment calls itself "the seam for an error tracker". U5 proposes a first-party, CSP-safe design. |

### 1.2 Findings

*Evidence*: **measured** items name the screenshot, the axe rule or the number; **code** means read at `bc66b1d` and not yet seen live, with the confirming check in the section that fixes it.

| ID | Sev | Area | Location | Finding | Evidence | § |
|---|---|---|---|---|---|---|
| **A11Y-13** | S1 | A11y · study | `FlipCard.tsx:92–100`, `FlashcardReviewClient.tsx:969–975`, `:839–843` | The card is a `<button aria-label=…>`. The label ("Showing the question. Press to reveal the answer.") is the control's accessible name, and the card's text is in neither its name nor its description. The only live region announces "Card N of M". A screen-reader user hears how to operate the card but never what's on it. | measured: Chrome AX tree over `FlipCard`'s markup → `button "Showing the question. Press to reveal the answer."`. VoiceOver not available: §5.4 check | 5.4 |
| **UX-07** | S1 | Study · mobile | `globals.css:860–872` (`.flip__body`), `:969–975` (`.flip` max-height) | The card face is `clamp(2.35rem, 3.6vw, 3.25rem)` whatever the text's length: **37.6 px at 375 px**, 46.1 px at 1280. The PDF prompt asks for "a factual 1–3 sentence definition", and the study prompt *is* that definition (`back`). A 300-character prompt at 375×812: **13 lines, 6 visible, 308 px hidden** in an inner scroll with a thin scrollbar as the only cue. At 375×667, even the starter deck's longest card (133 chars) hides 58 px. At 1280×800 a 300-character prompt hides 133 px. Design system §3.3 and §7.6 disagree on this size (38–52 px vs 25–34 px). | measured: `cardfit__375x812__pdf300.png`, Appendix C.1 | 5.3 |
| **FLOW-01** | S1 | Study · Today | `(shell)/page.tsx:387–393`, `DueNowBand.tsx:177–183, 249`, `study.ts:3`, `FlashcardReviewClient.tsx:910–921` | Today's band reads "*47* cards due across *3* decks · est. *8* min". **Start session** (and each "due by deck" link) opens `/study` with no `count`, so the session is `DEFAULT_SESSION_CARD_COUNT` = **10 cards of the top deck**. It ends on "Review complete", offering *Review Again* (which repeats the ten cards already scheduled) and *Back to deck*. Nothing continues to the other 37. | code; §5.5 check | 5.5 |
| **FLOW-03** | S1 | Study | `FlashcardReviewClient.tsx:348–445` | No undo. A grade is written the moment it's pressed; the outbox exists only to roll back failures. A slip onto **1** on a mature card sends it to relearning and drops its ease for good. Anki (Ctrl+Z) and RemNote both undo. | code | 5.6 |
| **COPY-01** | S1 | Landing · trust | `SocialProof.tsx:56–58`, `HeroSection.tsx:114`, `HowItWorks.tsx:10`, `FeatureGrid.tsx:22` | "10,000+ Active students", "2,000,000+ Cards studied", "4.9 Average rating": constants, not reads (the file's own comment says they "need substantiating or removing before launch"). Production holds a handful of decks. The hero claims flashcards "in 30 seconds" (measured: 2–61 s per call); step 1 claims "Cognit handles any format"; features say "PDFs, markdown and plain text" (upload accepts `application/pdf` only, `PDFUploadZone.tsx:28`). | measured: `landing__1280__dark__scrolled.png` | 3.1 |
| **FLOW-05** | S1 | Sharing · funnel | `auth/actions.ts:147`, `s/[token]/page.tsx:135` | "Save this deck — free" sends a visitor to `/login?redirectTo=/s/<token>`. Sign-in honours it; **sign-up doesn't**: `emailRedirectTo` is `${baseUrl}/auth/callback` with no `next`, so after confirming their email the visitor lands on an empty dashboard, not the deck they came to save. | code; §3.2 check | 3.2 |
| **UX-06** | S1 | Time | `202609011200…rpcs.sql:26` (`at time zone 'UTC'`), `(shell)/page.tsx:314–366`, `DueNowBand.tsx:12`, `ActivityHeatmap.tsx:17`, `dashboard-forecast.ts:59–63` | Every "day" is a UTC day: the streak, "Reviewed today", the heatmap, the 7-day forecast's weekday columns. For a user in UTC+8 (the owner), today starts at 08:00. Reviews at 07:30 count towards yesterday, "Reviewed today" reads 0 after a morning session, and a streak can break or extend by the clock rather than by study. | code | 6.1 |
| **PERF-06** | S2 | Study · latency | `FlashcardReviewClient.tsx:81, 848, 924–930`, `globals.css:783` (`--dur-flip` 520 ms), `motion-configs.ts:47–51` | From a grade key to the next prompt **readable: ≈ 909 ms**: a 160 ms commit flash, then `AnimatePresence mode="wait"` holds the new card until the old one's exit spring settles (opacity reaches framer's 0.005 rest threshold at **556 ms**), then the enter spring reaches 95 % opacity at 193 ms. Fully at rest: 1,272 ms. Reveal: the answer face appears at 260 ms and squares at 520 ms. About **1.2–1.8 s of every card is animation**, which is **1–1.5 minutes of a 50-card session**. Anki's reveal and advance are instant. | measured: framer-motion 12.34.3 `spring` generator, Appendix C.2; live confirmation §5.7 | 5.7 |
| **COPY-02** | S2 | Vocabulary | `GreetingHeader.tsx:92–95`, `DeckRow.tsx:171–190, 65–71`, `FlashcardReviewClient.tsx:893–896`, `stats/page.tsx` (Retention · 30d), `DeckSessionLauncher.tsx` ("mastery score") | UX-02 fixed the deck header only. **"Retention"** still means three things: quiz-proven share (Today's header), good+easy share of this session (study summary), and review pass rate (Stats). **"Mastery"** on each deck row is the quiz-proven share, painted `--state-mastered` from 70 % and driving the row's tick, which UX-02 reserved for SM-2 "mastered" (interval ≥ 21 d). | code | 6.2 |
| **COPY-03** | S2 | PDF | `PDFUploadZone.tsx:312–323` | The just-generated preview labels `card.front` **"Question"** and `card.back` **"Answer"**. In this schema `front` is the term (the answer) and `back` is the definition (the prompt), so the first cards a new user sees are labelled the other way round from how they'll be studied: the F-07 naming trap, back again. | code | 3.3 |
| **FLOW-07** | S2 | Sharing · SEO | `layout.tsx:44, 49, 59`, `sitemap.ts:6, 12`, `robots.ts:10`, `s/[token]/page.tsx:44–48` | Every page's `og:url` is `https://cognit.app` and its `og:image` is `https://cognit.app/og-image.png`. `cognit.app` doesn't resolve (curl: connection failed), and `/og-image.png` is **404** on production. Share pages replace `openGraph` without an image, so a link pasted in Discord or iMessage unfurls with no picture. The sitemap and robots name the dead domain. | measured: curl, Appendix C.4 | 3.4 |
| **FLOW-06** | S2 | PDF · feedback | `PDFUploadZone.tsx:120–172, 276–300` | Seed S6, extended (§1.1). | code | 6.4 |
| **FLOW-02** | S2 | Study | `FlashcardReviewClient.tsx` (no binding) | No way to fix a card from the study canvas. AI-written cards are where errors surface, mid-review; the user has to *Save & exit*, open the Cards tab, find the card, edit it, then start a new session. Anki: `E` edits the current card; RemNote edits inline. | code | 5.8 |
| **VIS-01** | S2 | Design system · quiz | `QuizAssessmentClient.tsx:255–290, 729–771` | The quiz result awards **"Flawless Victory"**, **"Speed Demon"** and **"Steady & Sure"** badges and a **letter grade**. That's a game, which the thesis rules out ("never a game"). "Steady & Sure" is painted `--state-streak`, a state hue on something that isn't a streak. | code | 7.3 |
| **VIS-02** | S2 | Design system | `Flashcard.tsx:55–56, 98–110`, used by `FlashcardWithActions.tsx:216` (deck **Cards** tab) and `s/[token]/page.tsx:162` | ±8° cursor tilt, driven by two springs, on cards people read: the deck's card list and the share-page previews. §1.1 bans cursor tilt on readable content, and §5 allows exactly one spring. The component's comment calls this the "marketing showpiece", but both consumers are content. | code | 7.3 |
| **VIS-04** | S2 | Design system · planes | `FlashcardReviewClient.tsx:857–905`, `QuizAssessmentClient.tsx:720–926` | The study summary is six `.surface` blocks and the quiz result five, with **no `.raised`**: the §7.1 / §11.11 failure DS-01 fixed on Insights. The screen's subject (the session's outcome) sits at the same weight as its footnotes. | code | 5.5, 7.4 |
| **A11Y-14** | S2 | Touch | `LoginClient.tsx` (Forgot password, Sign up, Show password), `DeckSessionLauncher.tsx:37, 124, 204` (30 px chips, count input, Start quiz), `DeckRow.tsx:111` (38 px row), `button.tsx:71` (`sm` 32 px) | Design system §9: ≥ 44 × 44 px. Measured at 375 px on `/login`: "Forgot password?" **101 × 16**, "Sign up" **50 × 20**, "Show password" **26 × 26**, theme toggle **34 × 34**, Sign in 285 × 40. 9 of 11 targets under 44 px. From code: the deck launcher's scope chips, session count and quiz controls are 30 px; deck rows 38 px; every `size="sm"` button 32 px. All clear WCAG 2.5.8's 24 px except the two login text links' height. | measured: Appendix B.2; code for signed-in | 7.5 |
| **A11Y-12** | S2 | A11y · landmarks | see S3 | Seed S3, widened (§1.1). | measured: axe `landmark-one-main`, `skip-link`, `region` | 7.6 |
| **DS-08** | S2 | Design system · type | `globals.css:118–123`; 65 files | Seed S1 (§1.1). | measured: `rg` counts, Appendix C.5 | 7.1 |
| **FB-01** | S2 | Feedback · undo | `FlashcardWithActions.tsx:237`, `DeckCardsManager.tsx:285` vs `DeckActions.tsx:40–47`, `SynthesisDrillClient.tsx:584–596` | Two undo models. Trashing a deck and archiving a drill take effect at once with an Undo toast; deleting a card, or 50 cards in bulk, needs a confirm dialog ("cannot be undone") and is permanent. The heavier action has the lighter safety net. | code | 6.5 |
| **MOB-05** | S2 | Study · touch | `FlashcardReviewClient.tsx:938–953` | Swipe right grades Good and swipe left Again, but nothing says so: no hint, no label while dragging, no threshold cue. The card only rotates. Hard and Easy have no gesture. AnkiMobile shows the answer button a swipe will press. | code | 5.9 |
| **IA-01** | S2 | Explore | `explore/page.tsx:44–60` | `/explore` has no wordmark, no way home, no sign-in and no theme toggle: a dead end for a signed-out visitor. With no query, its empty state reads "No listed decks match." (there is nothing to match yet). | measured: `explore__375__dark.png` | 3.5 |
| **TEST-01** | S2 | Tests | `package.json`, `vitest.config.ts` | Seed S5 (§1.1). | measured | 4 |
| **PERF-09** | S2 | Measurement | `logger.ts` | Seed S8 (§1.1). | code | 8 |
| **IA-03** | S2 | Navigation · mobile | `AppRail.tsx:51` (`hidden … md:flex`), `AccountControl.tsx`, `Breadcrumb.tsx` | Below 768 px, Statistics is reachable only by typing "stats" into ⌘K search. **Already fixed by SSP NAV-05** (the drawer); recorded so it isn't raised again. | code | SSP §6.5 |
| **IA-04** | S2 | Search | `DeckCardsManager.tsx:72, 276`, `CommandPalette.tsx:121–145, 224–225` | There's no way to find a card by its words. The Cards tab pages 60 at a time ("Load more cards (60 of 240)") with no filter, and the only card search is ⌘K's semantic search: one Gemini embedding call per query, which fails when the free tier returns 429. Finding the card to fix (FLOW-02's workaround today) means paging. | code | 6.7 |
| **UX-08** | S2 | Study · rhythm | `FlashcardReviewClient.tsx:615–622` | After the reveal, Space and Enter do nothing. Anki's reviewer grades **Good** on Space/Enter after reveal, so a whole session runs on one key plus the occasional 1 or 2. Decision OD-3. | code | 5.7 |
| **VIS-03** | S3 | Design system · state | `QuizAssessmentClient.tsx:822`, `SynthesisDrillClient.tsx:771` | "Correct answer: …" is set in `--state-lapsed`. The correct answer isn't a lapse, and the diagnostics list below puts the same text in ink. The drill's "Checking" tick uses `--state-streak`, a state hue on a network wait. | code | 7.3 |
| **DS-09** | S3 | Design system · type | see S2 | Seed S2, corrected (§1.1). | code | 7.2 |
| **DS-10** | S3 | Design system · doc drift | `COGNIT_DESIGN_SYSTEM.md` §3.3, §4.2, §7.2, §7.6 vs `globals.css:113–116`, `button.tsx:70–75` | The document contradicts itself and the code. §3.3 has no `--type-display-sm` (the code does, at 24 px) and calls `display-lg` the page title, while app `h1`s use `type-display`. §7.6 sets the card at 25–34 px, §3.3 at 38–52 px. §7.2 says buttons are 34 px, §4.2 says 40 px; the code ships 32 / 40 / 44. | code | 9 |
| **COPY-04** | S3 | Landing | `Footer.tsx:9–21, 43` | 9 of the footer's 11 links (Pricing, Changelog, About, Blog, Careers, Contact, Privacy, Terms, Cookies) and all three social icons are `href="#"`. There's no privacy page, while uploaded PDFs go to Gemini's free tier, where Google may use prompts. | measured: `landing__375__light.png` | 3.1 |
| **COPY-05** | S3 | Voice | 103 toast call sites; `error.tsx:51`, `dashboard/error.tsx:48`, `FlashcardReviewClient.tsx:711, 759–764, 913`, `QuizAssessmentClient.tsx:723, 746, 1044`, `LoginClient.tsx:163, 207`, `PDFUploadZone.tsx:144` | The voice drifts from "precise, quiet". Exclamation marks: "Reset email sent!", "Check your email!", "cards generated and saved!", "You're all caught up!". Title Case beside sentence case: "Start New Session", "Resume Session", "Back to Deck", "Review Again", "Quit Quiz", "Quiz Result", "Avg. per Question". `dashboard/error.tsx` says "This deck failed to load" for **every** dashboard route (Today, Stats, study, quiz). Both error boundaries say "The error has been logged", but a client-side render error goes only to that browser's console. | code | 6.6 |
| **COPY-06** | S3 | Deck row | `DeckRow.tsx:150–160` | A due drill count renders as "+2d" in a mono column beside ease, which reads as "plus two days". | code | 6.2 |
| **FLOW-04** | S3 | Onboarding | `DashboardOnboarding.tsx:98–150` | The three ways to start are labelled "Step 1 / 2 / 3", though they're alternatives. The page's one filled button is the PDF path, estimated "~30s" (real: 2–61 s per call, and it starts with a create-deck modal), rather than the starter deck, which really is one click. | code | 6.3 |
| **MOB-06** | S3 | Study · mobile | `FlashcardReviewClient.tsx:777–837` | At 375 px the session header wraps to three rows (exit · deck and card · ease, elapsed and pause), about 110 px above a card that is already short of room. | measured: `cardfit__375x812__pdf300.png` | 5.3 |
| **PERF-07** | S3 | Study · runtime | `FlashcardReviewClient.tsx:219–229, 563–588` | A 1 s interval re-renders the whole 1,081-line client to tick "Elapsed", and the persistence effect depends on `nowMs`, so it `JSON.stringify`s the session into `sessionStorage` every second: 2,400 writes in a 40-minute session. | code | 5.1 |
| **PERF-08** | S3 | Loading | `src/app/s/[token]/`, `src/app/explore/` | Seed S7, extended (§1.1). | measured: Appendix C.4 | 6.6 |
| **A11Y-15** | S3 | A11y · PDF | `PDFUploadZone.tsx:176–229` | The drop zone is a `div role="button"` that contains a real `<button>` (Remove): nested interactive controls (axe `nested-interactive`). | code | 7.5 |
| **IA-02** | S3 | Deck page | `[deckId]/page.tsx:531–535` | "Merge this deck" sits on every deck's Overview, the page opened to study. It's the UX-01 pattern (an episodic tool on the front page) with a destructive action behind it. | code | 6.2 |
| **REF-01** | S3 | Engineering | `FlashcardReviewClient.tsx` | Seed S4 (§1.1). | measured: `wc -l` | 5.1 |

What was checked and found fine is in §1.3.

### 1.3 Verified good: don't break these

- **No horizontal overflow** on any public page at 375, 768 or 1280 px, in either theme (`scrollWidth ≤ viewport` on all 44 captures).
- **Colour and ARIA on public pages:** axe reports **zero** `color-contrast`, `aria-*`, `label`, `button-name` or `link-name` violations on the eight public surfaces, in both themes and at both widths. The only violations are landmark ones (A11Y-12).
- **Bundles:** all ten budgeted routes are inside `scripts/bundle-budgets.json`, from `/` at 182.7 kB gz to `/dashboard/[deckId]` at 234.9 kB (Appendix C.3). KaTeX and highlight.js stay out of first load.
- **No-JS landing:** with JavaScript disabled, every landing section renders visible. `RevealOnScroll` starts from the resting state on the server (`motion.tsx:156`).
- **Starter decks:** after sign-in, one click on a starter deck creates it, imports 20 cards with no AI call, and opens the first review (`DashboardOnboarding.tsx:34–73`). That's the best time-to-value path in the product; keep it one click.
- **Grade keys:** each shows the real SM-2 interval it will set (`GradeKey.tsx:71`, `projectedInterval`), its keycap is visible at every width, the key holds its detent on press, and the name carries grade, key and interval.
- **Optimistic grading:** grades queue in order and never block the next card, and a failure rolls the session back to the failed card (`FlashcardReviewClient.tsx:348–392`). The undo in U2 is built on this outbox; don't replace it.
- **Pause is honest:** `P` stops the clock, the page goes `inert`, and paused time isn't counted (`:239–260`). A `beforeunload` guard holds while grades are unsent.
- **Resume:** an interrupted session resumes from `sessionStorage` with its queue, index and duration validated before use (`:143–196`).
- **Reduced motion:** the commit flash, the flip, the leave spring, the odometer and the grade-key haptic all stand down under `prefers-reduced-motion` (`:463–466`, `globals.css:977–987`, `GradeKey.tsx:85–95`).
- **KBD-01 held:** every window-level `keydown` handler read in this audit calls `pageShortcutBlocked` first (study, quiz, due band, palette, drill canvas).
- **Theme without a flash:** the pre-paint script is allowed by hash, follows the OS when nothing is stored, and both themes are composed rather than inverted.
- **Error boundaries** show a digest to quote, and 404 copy explains that share links die when a deck goes private.
- **iOS zoom guard** (`globals.css:1614–1620`) covers every text field whatever its class.
- **⌘K search spends AI only on request:** the semantic card search runs when the user picks "Search card text" and presses Enter (`CommandPalette.tsx:224–225`), never per keystroke.

### 1.4 Competitors: what they do better, specifically

Anki (desktop 24.x, AnkiMobile, AnkiDroid) and RemNote are the two the design system names; Quizlet is included because it's where most students start.

| What | Anki | RemNote | Quizlet | Cognit today | Here |
|---|---|---|---|---|---|
| Rhythm after reveal | Space/Enter = **Good**; a session runs on one key | Space shows the answer; 1–4 grade | Tap or swipe | Space reveals; after that only 1–4 work | UX-08, OD-3 |
| Undo | **Ctrl+Z** undoes the last answer; an Undo button on mobile | Undo | Undo after a swipe | None | FLOW-03 |
| Fix a card mid-review | **E** opens the editor on the current card; flag (Ctrl+1–7), bury (−), suspend (@) | Edit inline in the queue | Edit from the study screen | None; leave the session | FLOW-02, OD-6 |
| How much gets studied | A session studies everything due in the selected deck, up to your daily limits | "Practice all" queue across documents | Rounds sized to the set | 10 cards of one deck, then a dead end | FLOW-01 |
| Reveal and advance | Instant | Instant | ~150 ms | ≈ 0.26–0.52 s reveal, ≈ 0.9 s advance | PERF-06 |
| Long text on a phone | Card HTML scales with the device's font setting and scrolls the page | Text wraps at body size | Auto-shrinks long terms and definitions | 37.6 px regardless of length, inner scroll | UX-07 |
| Swipe | AnkiMobile: configurable swipe and tap zones, the target button highlights while dragging | — | Swipe with an on-card label ("Know", "Still learning") | Swipe, no label, no hint | MOB-05 |
| Where a card came from | — | A card from a PDF highlight links back to it in context | — | `source: 'ai_pdf'`, no page | §11 (out of scope) |
| Screen readers | Reviewer is plain HTML; the question text is read | Readable | Readable | The card's name replaces its text | A11Y-13 |

What Cognit already does better, and should keep: the interval on every grade key before you commit (Anki shows it only above the buttons), a real one-click starter path (Anki opens on an empty collection), synthesis drills and exam planning (none of the three has an equivalent), and an honest, quiet visual system.

### 1.5 Open verifications: what this audit could not see

| # | Check | How | Decides |
|---|---|---|---|
| V1 | Every signed-in surface at 375 / 768 / 1280 × light / dark, with axe | Add `LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD` to `.env.local`, then `node --env-file=.env.local scripts/k6-session.mjs` → cookie → Appendix D.1 with `surfaces-signed-in.json`; or U1's harness | Confirms or corrects every *code* row in §1.2 |
| V2 | Study latency, live | Appendix D.3 `studytiming.mjs` against a seeded deck, with and without reduced motion | PERF-06 numbers (predicted: median advance ≈ 900 ms) |
| V3 | VoiceOver on the study card | iPhone or macOS VoiceOver: open a study session, VO-Right to the card | A11Y-13 (predicted: hears the label, not the question) |
| V4 | Leaving during PDF generation | Start a 25-card generation, click the breadcrumb after 5 s; then repeat, closing the tab | FLOW-06: do cards save, and are they quiz-ready? |
| V5 | Offline mid-session | DevTools → Offline after card 3; grade cards 4–6; go back online | Whether the rollback lands where a user expects |
| V6 | Real phones | iOS Safari and Android Chrome: study with swipe and keys, a long card, the grade band in the safe area | UX-07, MOB-05, MOB-06 |
| V7 | Time to first review | A fresh account: landing → sign-up → confirm → starter deck → first card, timed; then the PDF path | FLOW-04; the "~5 s / ~30 s / ~2 m" estimates |

---

## 2. Roadmap

### 2.1 Phases

| Phase | Items | Size | Gate |
|---|---|---|---|
| **U0** Trust hotfixes | COPY-01, COPY-04, FLOW-05, COPY-03, FLOW-07, IA-01 | 0.5–1 d | GU0 |
| **U1** Harness | TEST-01 | 2.5 d | GU1 |
| **U2** Study loop | REF-01, PERF-07, UX-07, MOB-06, A11Y-13, FLOW-01, FLOW-03, PERF-06, UX-08, FLOW-02, MOB-05, VIS-04 (study half) | 7–8 d | GU2 |
| **U3** Today and words | UX-06, COPY-02, COPY-06, IA-02, FLOW-04, FLOW-06, FB-01, COPY-05, PERF-08, IA-04 | 5–6 d | GU3 |
| **U4** Conformance | DS-08, DS-09, DS-10 (doc), VIS-01, VIS-02, VIS-03, VIS-04 (quiz half), A11Y-14, A11Y-15, A11Y-12 | 3–3.5 d | GU4 |
| **U5** Measurement | PERF-09 | 1.5 d | GU5 |

Sizes are single-developer days and include the tests each section names. Two phases add a migration: U3 (§6.1, the local-day RPCs) and U5 (§8.1, `rum_samples`). U2 needs none, because undo holds the grade on the client (§5.6).

### 2.2 How this interleaves with SSP

SSP (sidebar, settings, 9–12 days) and this plan touch some of the same files. The overlaps:

| This plan | SSP | Rule |
|---|---|---|
| FLOW-01 session size | SET-04 (cards per session, in `user_settings`) | U2 reads a helper, `sessionChunkSize(settings?)`, that returns the setting when SSP Phase 2 has landed and `DEFAULT_SESSION_CARD_COUNT` before. Neither plan blocks the other. |
| New bindings (`Z`, `E`, Space-as-Good) | SET-06 `src/lib/shortcuts.ts` registry and its test | If SET-06 has landed, each new binding adds a row to `SHORTCUTS` in the same commit (SSP standing rule). If not, SET-06 must include them. |
| IA-03 Stats on phones | NAV-05 drawer | Fixed by SSP; nothing here. |
| DS Rev. E (SSP Appendix B) | Rev. F (§9 here) | Rev. F is written against Rev. E. If U4 runs before SSP's DSR-01, apply Rev. E first. |
| A11Y-14 targets on the shell | NAV-05 (44 px items in the drawer) | U4 leaves the rail and header alone; SSP replaces them. |
| U1 harness | SSP gates S1–S3 are manual today | U1 lets SSP's axe, keyboard and 44 px checks run as specs. That is the main reason to run U1 before SSP Phase 1. |
| `(shell)/page.tsx` (Today) | NAV-07 edits Today | U3's UX-06 and COPY-02 edits to Today land after NAV-07 if SSP Phase 3 is done, otherwise before; they touch different lines (the streak block and `GreetingHeader` props, vs `TrashPanel` and the drill href). |

**Recommended order:** U0 → U1 → SSP 0 → SSP 1 → U2 → SSP 2 → SSP 3 → U3 → U4 → U5. U0 is too cheap and too visible to wait. U1 makes every later gate, SSP's included, a command instead of an afternoon. U2 is the largest gain for users and doesn't depend on SSP. The owner can reorder (OD-1). Every phase is safe to push to `main` on its own.

---

## 3. Phase U0 — Trust hotfixes

Six small changes that need no harness: copy, one parameter and metadata. Each is verified by a unit test, `rg`, `curl` or one manual step. **0.5–1 day.**

### 3.1 COPY-01 · COPY-04 — The landing page says only true things

1. **Delete the social proof.** Remove `<SocialProof />` and its `<section>` from `src/app/page.tsx:16–18`, and delete `src/components/landing/SocialProof.tsx`. (OD-5 offers real counts instead; the recommendation is to delete. Production's real numbers would read as a small product, and a count is only worth showing once it's worth reading.)
2. **Claims that match the product.**

| File | Before | After |
|---|---|---|
| `HeroSection.tsx:114` | "Turn dense documents into high-yield flashcards in 30 seconds. Let the SM-2 algorithm engineer your retention." | "Turn a PDF into flashcards, then let SM-2 schedule every review." |
| `HowItWorks.tsx:10` | "Drop a PDF, paste your notes, or type questions manually. Cognit handles any format so you can start studying in seconds." | "Upload a PDF, paste notes as *Term – Definition*, or write cards yourself." |
| `FeatureGrid.tsx:22` | "Upload a document and Cognit extracts the study material. PDFs, markdown and plain text." | "Upload a PDF and Cognit writes cards from its text. Paste plain-text notes to import them as cards." |
| `HeroSection.tsx:144` | "cognit.app/dashboard" (a domain that doesn't resolve) | "Today" |

3. **Footer: no dead links.** In `Footer.tsx`, keep *Features* and *How it works* (in-page anchors) and, if the repository stays public, one GitHub link to it. Delete Pricing, Changelog, About, Blog, Careers, Contact, Privacy, Terms and Cookies, and the X and Discord icons. Privacy returns when there is a page to link to (OD-10; SSP SET-07 already puts the Gemini free-tier notice inside the app).

**Test:** a Vitest test that reads the landing components' source and fails on `/\b\d{1,3}(,\d{3})+\+/` (a "10,000+"-style count) and on `href: '#'` / `href="#"`. It's crude, and meant to be: it keeps both from coming back.

### 3.2 FLOW-05 — Signing up from a share link keeps the deck

`src/app/auth/actions.ts`: `signup` takes the redirect the way `login` already does, and passes it through the confirmation link.

```ts
// ─── SIGNUP ───
export async function signup(data: SignupInput & { redirectTo?: string | null }) {
  const parsed = signupSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const baseUrl = await resolveBaseUrl();
  // The confirmation link lands on /auth/callback, which already honours a
  // safe relative `next` (callback/route.ts:50–53). Without it, a visitor who
  // signed up from "Save this deck" confirmed into an empty dashboard.
  const next = encodeURIComponent(resolveRedirectPath(data.redirectTo));

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${baseUrl}/auth/callback?next=${next}` },
  });
  // … unchanged
}
```

`LoginClient.tsx:198`: `signup({ email, password, redirectTo: searchParams.get('redirectTo') })`. The OAuth path already sends `/auth/callback?next=…` (`actions.ts:121`) through the same allow-list, so if Google or GitHub sign-in from a share link works in production today, the allow-list accepts this too. GU0 checks it end to end.

**Test:** export `resolveRedirectPath` for testing (or test through `signup` with the Supabase client mocked, as `_shared.test.ts` mocks it) and assert `/s/abc` → `…/auth/callback?next=%2Fs%2Fabc`, `//evil.com` → `next=%2Fdashboard`, `null` → `next=%2Fdashboard`.

### 3.3 COPY-03 — The PDF preview matches the study card

`PDFUploadZone.tsx:312–323`: the label "Question" goes over `card.back` and "Answer" over `card.front`, in that order, which is how `FlipCard` will show them. Add the naming-trap comment the rest of the codebase uses (`front` is the answer).

`LABEL` below stands for the label-step class string the file already repeats (U4 turns it into `type-label`).

```tsx
{/* `front` is the answer and `back` is the question in this schema (design system §7.6). */}
<p className={LABEL}>Question</p>
<p className="mt-1 text-sm leading-relaxed">{card.back}</p>
<hr className="my-3 border-border" />
<p className={LABEL}>Answer</p>
<p className="mt-1 text-sm leading-relaxed text-ink-dim">{card.front}</p>
```

### 3.4 FLOW-07 — Link unfurls point at a real domain and a real image

1. `src/app/layout.tsx`: add `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cognit-nine.vercel.app')`. Set `openGraph.url` to `'/'`. Delete both hard-coded `images` arrays (`:48–53`, `:59`).
2. **New** `src/app/opengraph-image.tsx`. It's generated at build and served same-origin, so the CSP is unaffected.

```tsx
import { ImageResponse } from 'next/og';
import { OG_PALETTE } from '@/lib/og-palette';

export const alt = 'Cognit: flashcards from your own material, scheduled by SM-2';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The link unfurl. `next/og` can't read CSS variables, so the dark tokens come from one TS constant (Rev. F §9.8). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 96, background: OG_PALETTE.bg, color: OG_PALETTE.ink }}>
        <div style={{ fontSize: 112, letterSpacing: '-0.03em' }}>Cognit</div>
        <div style={{ marginTop: 28, fontSize: 40, color: OG_PALETTE.inkDim }}>Flashcards from your own material, scheduled by SM-2.</div>
      </div>
    ),
    size,
  );
}
```

`src/lib/og-palette.ts` exports `{ bg: '#09090b', ink: '#fafafa', inkDim: '#a1a1aa' }`, with a comment pointing at `globals.css`'s `.dark` block. (Instrument Serif in the image would need the TTF committed to the repo; it isn't worth it for U0.)

3. `src/app/s/[token]/page.tsx:44–48`: `generateMetadata` replaces `openGraph`, so give it the image explicitly: `images: [{ url: '/opengraph-image', width: 1200, height: 630 }]`.
4. `sitemap.ts` and `robots.ts`: build URLs from `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cognit-nine.vercel.app'`.

### 3.5 IA-01 — Explore gets a frame

`explore/page.tsx:44`: give the page the share page's header (`Wordmark` → `/` and `ThemeToggle`), plus a quiet link: "Sign in" (signed out) or "Your decks" (signed in; read with `getSessionUser()`, which the share page already calls). Empty state: with no `q`, "No decks are listed yet."; with a `q`, "No listed deck matches “{q}”.". It's behind `EXPLORE_ENABLED`, so this is cheap now and necessary before the flag flips.

### 3.6 Gate GU0

| Check | How | Pass |
|---|---|---|
| Unit and build | `npx tsc --noEmit && npm run lint && npm test && npm run build` | green; the landing test and the redirect test are new |
| No invented numbers | `rg -n "10,000\|2,000,000\|4\.9" src/components/landing` | no matches |
| No dead links | `rg -n "href: '#'\|href=\"#\"" src/components/landing` | no matches |
| Unfurl | `curl -s https://cognit-nine.vercel.app/ \| grep -oE 'og:(url\|image)"[^>]*'` after deploy; then `curl -sI` the image URL | both on `cognit-nine.vercel.app`; the image returns 200 `image/png` |
| Share unfurl | Paste a `/s/<token>` link into Discord or iMessage | title, description and image |
| Sign-up from a share link (owner, a throwaway address) | Signed out: open `/s/<token>` → Save this deck → Sign up → confirm the email | lands on `/s/<token>`, and Save works |
| PDF labels | Generate from any PDF | "Question" shows the definition, "Answer" the term, as on the study card |

---

## 4. Phase U1 — The UI test harness (TEST-01)

### 4.1 Why first

Every S1 in this plan is on a screen that has never been tested by anything that renders it. U2 rewrites the study loop's behaviour: undo, continuation, transitions, keyboard and screen-reader output. Without a harness, its gate would be the same set of manual checks the owner hasn't had time to run for G1 and G2. With it, those checks become specs that run on every push: study latency, the card's accessible name, 44 px targets, axe on every surface, focus restoration, reduced motion. SSP's three gates gain the same coverage. The cost is 2.5 days, once.

The argument against is that U0 and parts of U3 are copy changes a harness adds little to. That's why U0 comes first, and why the harness is kept to what the next phases need (below) rather than aiming for coverage.

### 4.2 Shape

- **Runner:** `@playwright/test` with `@axe-core/playwright`, as dev dependencies. Chromium and WebKit projects. WebKit stands in for Safari's layout and focus behaviour; it doesn't replace a real iPhone (§1.5 V6).
- **Where the app runs:** `next build && next start -p 3100`, the production build, because dev mode's timings and overlays would make the latency and axe checks meaningless.
- **Where the data lives: two modes.**
  - **CI (`E2E_MODE=local`):** `supabase start` on the runner (the `database` job already starts Postgres this way) gives a full local stack. Local auth has `enable_confirmations = false` (`supabase/config.toml:225`), and the service-role key from `supabase status` creates the test user. Nothing touches production.
  - **The owner's Mac (`E2E_MODE=remote`):** there's no Docker here, so it runs against production Supabase with the `LOAD_TEST_*` account, and only ever touches decks titled `[e2e] …`.
- **No AI in the harness.** Nothing sets `GEMINI_API_KEY`, and no spec presses a button that calls Gemini. Where a phase needs an AI *state* on screen (U3's PDF wait), the server action returns a canned delay when `process.env.E2E_FAKES === '1'`, which only the CI job sets. It's read at runtime on the server, and production never sets it.

### 4.3 Files

```
playwright.config.ts
e2e/
  global-setup.ts        signs in, seeds the fixture deck, writes e2e/.auth/state.json
  fixtures.ts            test.extend: signed-in page, fixture deck id, axe helper, target helper
  seed.ts                the fixture deck: 12 cards, deterministic
  surfaces.ts            every route this plan audits, with its variants
  a11y.spec.ts           axe on every surface × {375, 1280} × {light, dark}
  targets.spec.ts        44 px on coarse pointers, 24 px elsewhere
  study.spec.ts          keyboard session, live region, latency budget (U2 fills it in)
  focus.spec.ts          dialogs return focus to their trigger
  screens.spec.ts        screenshots as CI artifacts (not assertions)
  axe-baseline.json      the ratchet: known violations, allowed to shrink only
  targets-baseline.json  the same for undersized targets
```

`vitest.config.ts` must exclude the folder, because Vitest's default include matches `*.spec.ts`: add `exclude: [...configDefaults.exclude, 'e2e/**']`. Add `e2e/.auth/` and `playwright-report/` to `.gitignore`.

**`playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: 'e2e/.auth/state.json',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

**`e2e/global-setup.ts`**, in outline (mode-dependent parts marked):

```ts
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import fs from 'node:fs';
import { seedFixtureDeck } from './seed';

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const email = process.env.E2E_EMAIL ?? process.env.LOAD_TEST_EMAIL!;
  const password = process.env.E2E_PASSWORD ?? process.env.LOAD_TEST_PASSWORD!;

  if (process.env.E2E_MODE === 'local') {
    // CI only: the local stack's service-role key creates the user. It is never set in remote mode.
    const admin = createClient(url, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    await admin.auth.admin.createUser({ email, password, email_confirm: true }).catch(() => undefined);
  }

  // The same cookie jar scripts/k6-session.mjs uses: @supabase/ssr writes exactly what the proxy reads.
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  process.env.E2E_DECK_ID = await seedFixtureDeck(supabase); // deletes '[e2e] %' decks, then inserts one

  fs.mkdirSync('e2e/.auth', { recursive: true });
  fs.writeFileSync('e2e/.auth/state.json', JSON.stringify({
    cookies: [...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' })),
    origins: [],
  }));
}
```

**`e2e/seed.ts`:** one deck, `[e2e] Study fixture`, with **12 cards**: four short prompts (≤ 60 characters), four starter-length (≈ 130), two PDF-length (≈ 300 and ≈ 600), one with `$…$` math and one with a fenced code block. Six are `review` with `next_review_at` an hour in the past (so `scope=due` finds them), and six are `new`. Insert through the signed-in client, so RLS applies exactly as it does for a user. In remote mode, remove the old fixtures first by title prefix; if RLS refuses a direct `delete()` on `decks` (the trash policy may), call the purge RPC from `202609240900` instead.

**`e2e/surfaces.ts`:** the audit's list as data. Public: `/`, `/login`, `/login?mode=signup`, `/explore`, `/s/<fixture token>` (seed shares the deck), a 404. Signed in: `/dashboard`, `/dashboard/stats`, the fixture deck's `?tab=overview|cards|insights|exam|chat`, `/study?count=5&scope=due`, `/quiz?count=5&mode=mcq`, and `/synthesis` (its empty and "too few cards" states are enough; no AI).

### 4.4 The four checks every later phase relies on

1. **axe, as a ratchet.** `a11y.spec.ts` runs axe with the audit's tags on every surface, at 375 and 1280, in both themes, and compares against `axe-baseline.json`, keyed `surface → rule → count`. **A new rule, or a higher count, fails.** A lower count prints "tighten the baseline" and passes. U1 commits the baseline as measured on the first run, and every later phase is expected to shrink it. After U4, `landmark-*`, `region`, `skip-link` and `nested-interactive` must be absent.
2. **Targets.** At 375 px on the two phone projects, every visible `a[href]`, `button`, `input`, `select`, `textarea`, `summary` and `[role=button]` must measure ≥ 44 × 44, except links inside running prose, which WCAG 2.5.8 exempts and which opt out with `data-target="inline"`. At 1280, ≥ 24 × 24. It uses a baseline ratchet like axe's; U4 empties it.
3. **Study latency** (budgets from Rev. F §9.5). With `requestAnimationFrame` polling, as in Appendix D.3: Space → the answer face visible **and** the flip settled; `3` → the next prompt visible, opacity 1, and at its rest position. Median over 5 cards: **reveal ≤ 200 ms, advance ≤ 300 ms** after U2. U1 commits the spec with today's measured numbers as the budget, so it passes now and U2 tightens it.
4. **Focus return.** Opening and closing each dialog (create deck, confirm, command palette, study pause, quiz quit) returns focus to its trigger, never to `<body>`.

### 4.5 CI

A third job in `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Local Supabase (every migration applied)
        run: supabase start
      - name: Export local keys
        run: supabase status -o env >> "$GITHUB_ENV"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium webkit
      - name: Build against the local stack
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ env.API_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.ANON_KEY }}
          NEXT_PUBLIC_SITE_URL: http://localhost:3100
      - name: Playwright
        run: npx playwright test
        env:
          E2E_MODE: local
          E2E_FAKES: '1'
          E2E_EMAIL: e2e@cognit.test
          E2E_PASSWORD: e2e-password-not-a-secret
          E2E_SERVICE_ROLE_KEY: ${{ env.SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ env.API_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.ANON_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report
```

Check the variable names `supabase status -o env` prints on the pinned CLI (`API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` at 2.117) before relying on them. The password is a fixed test value for a throwaway local stack, not a secret. Locally, the owner runs `npm run build` and then `npm run e2e` (`"e2e": "node --env-file=.env.local node_modules/.bin/playwright test"`), with `E2E_MODE=remote` and the `LOAD_TEST_*` keys in `.env.local`.

### 4.6 Gate GU1

| Check | How | Pass |
|---|---|---|
| Unit suite unaffected | `npm test` | 491 tests (or more), and no `e2e/` file collected |
| Harness, CI | push to `main` | the `e2e` job is green; the report artifact holds the screens |
| Harness, local | `npm run e2e` with `E2E_MODE=remote` | green against production Supabase; only `[e2e] …` decks were touched |
| Baselines | read `e2e/axe-baseline.json` | contains the public-surface violations in Appendix B.1, plus whatever the signed-in surfaces show; each signed-in count is added to §1.2 as a *measured* correction |
| Ratchet works | on a branch, add an unlabelled `<input>` to `/login` | `a11y.spec.ts` fails with `label` |
| Latency spec | `npx playwright test study` | prints today's medians; they're committed as the provisional budget |

---

## 5. Phase U2 — The study loop

The screen a user spends forty minutes on. Every change here is checked by U1's `study.spec.ts`, which this phase extends. **7–8 days.**

### 5.1 REF-01 · PERF-07 — Split `FlashcardReviewClient` first (1.5 days)

This is behaviour-preserving. It lands on its own commit, with `study.spec.ts` green before and after and no change to what the screen does.

| New file | Holds | From |
|---|---|---|
| `src/components/ui/shared/study/useStudySession.ts` | A `useReducer` over `{ queue, index, showAnswer, peeking, committedGrade, heldGrade, gradeLog, scheduledReviews, paused, pausedAt, startedAt }`, and the actions `reveal`, `peek`, `commit`, `apply`, `rollbackTo`, `pause`, `resume`, `restart`, `resume-from-storage`. The requeue rule (`insertRequeueCard`) and the SM-2 input for the active card become pure functions beside it. | `:103–445` |
| `…/study/useGradeOutbox.ts` | The ordered outbox, `flush()`, `pending`, and (§5.6) `hold`, `undo`. | `:198–207, 348–392` |
| `…/study/useStudyPersistence.ts` | `sessionStorage` save and restore. It writes **on events** (grade, reveal, pause, `visibilitychange` → hidden, `pagehide`), **not every second**. | `:143–196, 563–588` |
| `…/study/ElapsedClock.tsx` | The only component that re-renders every second. It takes `startedAt` and `pausedMs`. | `:219–229`, the `Elapsed` reading |
| `…/study/StudyHeader.tsx`, `StudyCard.tsx`, `GradeBand.tsx`, `StudySummary.tsx`, `StudyEmpty.tsx`, `StudyResume.tsx`, `PauseOverlay.tsx` | Presentational parts; no effects except the card's drag. | `:700–1080` |
| `FlashcardReviewClient.tsx` | Composition and the one `keydown` handler (still `pageShortcutBlocked` first). Target: under 250 lines. | — |

**Tests (Vitest, node):** `useStudySession.test.ts` drives the reducer directly (no DOM): a grade advances and logs; `again` requeues within `MIN/MAX_REQUEUE_OFFSET`; `rollbackTo` restores queue, index and log exactly; pause and resume shift `startedAt` by the paused time; restoring from a stored state rejects a mismatched version or card list (the current checks, `:155–189`, as cases).

PERF-07 is fixed by construction: after the split, a one-second tick re-renders one `<span>`, and storage writes drop from about one a second to about two per card.

### 5.2 Order inside U2

5.1 → 5.4 (small, and it changes `FlipCard`'s API) → 5.3 → 5.7 → 5.6 → 5.5 → 5.8 → 5.9. The latency work (5.7) goes before undo (5.6), because undo's window is designed around the new transition timings.

### 5.3 UX-07 · MOB-06 — The card fits its text (1 day)

**Type steps chosen by length** (Rev. F §9.2–§9.3). Serif never goes below 24 px (§3.3), so long text gets a smaller step and a wider measure, not a smaller floor.

```css
/* globals.css — replaces the single clamp at .flip__body (:860–872) */
:root {
  --type-study-lg: clamp(2rem, 3.2vw, 2.75rem);      /* ≤ 110 characters: 32 → 44 px */
  --type-study-md: clamp(1.625rem, 2.4vw, 2.125rem); /* 111–240: 26 → 34 px */
  --type-study-sm: 1.5rem;                           /* > 240: 24 px, the serif floor */
}
.flip__body                      { font-size: var(--type-study-lg); line-height: 1.25; max-width: 36ch; }
.flip__body[data-length='md']    { font-size: var(--type-study-md); line-height: 1.3;  max-width: 44ch; }
.flip__body[data-length='sm']    { font-size: var(--type-study-sm); line-height: 1.35; max-width: 52ch; text-wrap: pretty; }
```

```ts
// src/lib/study-type.ts
/** The card face's type step (design system Rev. F §9.3). Counts characters of the raw card text: markup is short and rare. */
export type StudyLength = 'lg' | 'md' | 'sm';
export function studyLength(text: string): StudyLength {
  const length = text.trim().length;
  return length <= 110 ? 'lg' : length <= 240 ? 'md' : 'sm';
}
```

`FlipCard` gets `promptLength` and `answerLength` props and sets `data-length` on each face's `.flip__body`. `FlashcardReviewClient` passes `studyLength(active.id_question ?? active.back)` and `studyLength(active.front)`. `MCQMode.tsx:169` and `IdentificationMode.tsx:109` replace their clamp with the same three steps, which also clears two DS-09 sites.

**Measured with the production CSS** (Appendix C.1), before → after:

| Viewport | Prompt | Before | After |
|---|---|---|---|
| 375 × 812 | starter max, 133 chars | 37.6 px, 7 lines, **26 px hidden** | 26 px, 4 lines, fits |
| 375 × 812 | PDF, 300 chars | 37.6 px, 13 lines, **6 visible, 308 px hidden** | 24 px, 9 lines, **fits** |
| 375 × 812 | PDF, 600 chars | 37.6 px, 29 lines, 1,060 px hidden | 24 px, 17 lines, 226 px hidden, cued |
| 375 × 667 | PDF, 300 chars | 37.6 px, 340 px hidden | 24 px, 9 px hidden, cued |
| 1280 × 800 | PDF, 300 chars | 46.1 px, 133 px hidden | 24 px, 5 lines, fits |

**A cue when it still overflows.** `useOverflow(ref)` (a `ResizeObserver` plus the scroll position) sets `data-overflow="below"` on `.flip__scroll` while there's more text under the fold. CSS fades the last 32 px (`mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), transparent)`) and shows "More below ↓" in the label step under the card, `aria-hidden` (a screen reader reads the whole text anyway, §5.4). The fade is a mask, not a colour, so it's the same in both themes.

**MOB-06: one header row below `sm`.** An icon button (44 × 44, `aria-label="Save and exit"`, arrow-left), then `3/10` and the elapsed clock in mono, then a 44 × 44 pause button with its `P` keycap. The deck title and ease move into the pause overlay and the summary. From `sm` up, the header is unchanged.

**Tests:** `study-type.test.ts` covers the boundaries (110, 111, 240, 241, empty, whitespace). `study.spec.ts` at 375 × 812 seeds the 300-character card and asserts that `.flip__scroll` has `scrollHeight - clientHeight ≤ 1`; with the 600-character card it asserts `data-overflow="below"`, then scrolls the face and asserts it clears.

### 5.4 A11Y-13 — A card a screen reader can read (0.5 day)

The card's text must be its accessible name, and the instructions a description.

```tsx
// FlipCard.tsx — the interactive branch (:92–100)
<button
  type="button"
  onClick={onReveal}
  data-state={state}
  data-grade={grade}
  aria-describedby={hintId}        // was aria-label={ariaLabel}: that replaced the card's text as its name
  className={cn('flip', className)}
>
  {faces}
</button>
<span id={hintId} className="sr-only">{hint}</span>
```

- `FlipCard` swaps `ariaLabel` for `hint` (and `useId` for `hintId`). `FlashcardReviewClient` passes "Press Space to show the answer." before the reveal, and "Grade with keys 1 to 4." after it. The hidden face is already `aria-hidden` (`FlipCard.tsx:75, 80`), so the name is always the visible face.
- **Announce the content, not only the position.** The polite live region (`:839–843`) becomes: on a new card, "Card 3 of 10. Question: {prompt}"; on reveal, "Answer: {answer}"; on commit, "Graded Good. Next review in 4 days." The prompt and answer use a plain-text rendering of the card (the raw string, with `$…$` read as its contents). KaTeX already emits MathML for the visible face.
- After a grade, move focus to the new card (`cardRef.current?.focus({ preventScroll: true })`), so a screen reader lands on the question it just heard announced.

**Tests:** `study.spec.ts` asserts `getByRole('button', { name: /<fixture prompt>/ })` before the reveal and `getByRole('button', { name: /<fixture answer>/ })` after it, and that the live region's text contains "Question:" and then "Answer:". **Manual (V3):** VoiceOver on macOS and iOS, VO-Right onto the card, hears the question, presses Space, hears the answer.

### 5.5 FLOW-01 · VIS-04 (study) — Sessions that tell the truth and keep going (1.5 days)

Keep sessions in chunks (a 40-minute block needs break points, and SSP SET-04 makes the chunk the user's), but say what the button does, and never end on a dead end while cards are due. OD-4 asks whether "Start session" should instead take every due card.

**1. Today says what it will start.** `(shell)/page.tsx:387–393` builds `sessionHref` with an explicit size and scope: `/dashboard/<deck>/study?scope=due&count=<chunk>`, where `chunk = sessionChunkSize(settings)`. Under the button, one line in the band's sub-copy style: "Starts with *Neuroanatomy* · *10* of *31*". `DueNowBand`'s per-deck links get the same `count`.

**2. The session end continues.** On completion, `StudySummary` asks the server what's left:

```ts
// src/app/actions/study.ts
/** What comes after a session (plan §5.5): this deck's remaining due cards, else the deck with the most due. */
export async function getStudyContinuation(deckId: string) {
  const parsed = deckIdSchema.safeParse(deckId);
  if (!parsed.success) return { error: 'Invalid deck id.' };
  const user = await getSessionUser();
  if (!user) return { error: 'You must be logged in.' };

  const supabase = await getRequestClient();
  const rows = await loadDueByDeckRows(supabase, user.id, new Date().toISOString());
  const here = rows.find((row) => row.deck_id === parsed.data);
  const next = rows
    .filter((row) => row.deck_id !== parsed.data && row.due_count > 0)
    .sort((a, b) => b.due_count - a.due_count)[0];
  // Titles for `next` come from one small decks read, scoped to the user.
  return { success: true, hereDue: here?.due_count ?? 0, next: next ? await withTitle(supabase, user.id, next) : null };
}
```

It's called once the outbox is flushed, so the counts include this session's grades. The summary's actions, in order, with exactly one primary:

| State | Primary | Secondary |
|---|---|---|
| `hereDue > 0` | **Keep going · next *10*** (*21* left here) → `router.push` to the same deck with `scope=due&count=<chunk>&round=<n+1>` | Back to deck |
| `hereDue = 0`, `next` | **Next: *Pharmacology* · *12* due** | Back to Today |
| nothing due anywhere | **Back to Today** | Study ahead (`scope=include_reviewed`) |

The `round` parameter matters: `next.config.ts:32` sets `staleTimes.dynamic` to 30 s, so pushing the **same** URL within 30 s would replay the cached payload, the ten cards just graded. The page ignores `round`; it only makes the URL new. "Review Again" goes: after a due session, repeating the same cards has no scheduling value. The keyboard: `Enter` on the summary activates the primary (the summary isn't a dialog, and the grade keys are unmounted, so there's no conflict).

**3. The summary gets a plane (VIS-04, study half).** One `.raised` holds the outcome: "Reviewed *10* cards in *4m 12s*", the grade split as four labelled numbers (the colours stay with their words), and the next review. The actions sit under it. Duration, average per card and "Recalled" go into one `.well` of rules, not three `.surface` tiles. "Retention rate" is renamed **"Recalled"** (COPY-02: *retention* is reserved for Stats' 30-day rate) and reads "*8* of *10*".

**Tests:** a Vitest test for `getStudyContinuation` with the RPC mocked (three states, plus an unowned deck id → no leak). `study.spec.ts`: the fixture has 6 due. A `count=5` session ends on "Keep going · next 1"; pressing Enter opens a one-card session; that one ends on "Back to Today".

### 5.6 FLOW-03 — Undo the last grade (1 day)

No migration. The outbox already rolls a grade back when the server refuses it (`:376–381`). Undo is the same rollback, applied by choice, to a grade the server hasn't received yet. So **hold the newest grade** in the outbox for a short window instead of sending it at once.

- **Send rule:** every job except the newest is sent immediately, in order, as now. The newest is sent when another grade is queued, when `UNDO_WINDOW_MS` = **6,000** passes, or on Save & exit, `visibilitychange` → hidden, or `pagehide`.
- **Undo:** `Z` (and `⌘Z` / `Ctrl+Z`), or the **Undo *Good*** text button that appears in the grade band for the window. It removes the held job and calls its `rollback()`. The card returns answer-side and armed, so it can be re-graded straight away. The live region says "Undid Good." Once the window closes the button goes, and there's nothing to undo; the grade is on the server.
- **The last card:** the summary waits for the window too, showing "Undo *Good*" beside its heading. Undo goes back to the card. `finishStudySession` and `getStudyContinuation` run after the flush.
- **The unload guard** (`:649–661`) already covers `pendingGrades > 0`, and a held grade counts.
- **Honest limit:** if the tab crashes inside the window, that one grade is lost. The card keeps its old schedule and comes back as due, which is the safe direction. Say so in a code comment, not to the user.
- **Keycap and registry:** the Undo button shows `<Kbd>Z</Kbd>`. It goes in SSP's `SHORTCUTS` as `{ id: 'study-undo', keys: ['Z'], label: 'Undo last grade', scope: 'Study', owner: 'FlashcardReviewClient' }`.

**Tests:** `useGradeOutbox.test.ts` with fake timers covers: two grades → the first sent at once, the second after 6 s; undo inside the window → never sent, and the reducer is back at the card; undo after the window → no-op; flush on hidden. `study.spec.ts`: grade `1`, press `Z`, the same card is shown armed, grade `3`. Then read the card through the fixture client: its `state` isn't `relearning`, and `study_logs` has exactly one row for it.

### 5.7 PERF-06 · UX-08 — Fast transitions, and Space as Good (1 day)

**Budget** (Rev. F §9.5): key → next prompt readable **≤ 300 ms**; Space → answer readable **≤ 200 ms**.

| Change | Where | Effect |
|---|---|---|
| Card exit is a 90 ms opacity tween, and the entering card doesn't wait for it (`mode="popLayout"`) | `FlashcardReviewClient.tsx:848, 924–930` | removes the 556 ms wait for the exit spring's opacity to reach rest |
| The spring stays, on `y` only; opacity enters on a 120 ms tween | same | the "card with mass" (§5) survives, and the text is readable by ~120 ms |
| Commit flash 160 → **120 ms** | `:81` | keeps the acknowledgement §7.6 asks for |
| Flip 520 → **320 ms**, so the answer face shows at 160 ms | `globals.css:152` (`--dur-flip`) | the reveal ends in about a third of a second |

```tsx
<AnimatePresence mode="popLayout" initial={false}>
  <m.div
    key={active.id}
    initial={{ opacity: 0, y: 22 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, transition: { duration: 0.09, ease: 'linear' } }}
    transition={prefersReducedMotion ? { duration: 0 } : { y: cardLeaveSpring, opacity: { duration: 0.12, ease: EASE_OUT } }}
  >
```

Predicted after (from the same spring generator and the new durations): about 120 + 120 = **240 ms** to readable. The live number comes from `study.spec.ts`, whose budget is tightened to 300 / 200 ms in this phase.

**UX-08: Space and Enter grade Good after the reveal** (OD-3, recommended yes). This is Anki's rhythm: one key reveals and one key accepts, so the hands move only for Again or Hard. The Good key shows a second keycap, `Space`, under its interval. The first reveal-then-Space of a session shows a one-time hint in the grade band: "Space grades Good. 1–4 for the others." (stored in `localStorage` `cognit-hint-space-good`). The `event.repeat` guard (`:603`) already stops a held Space from grading several cards. Registry row: `{ id: 'grade-good-space', keys: ['Space'], label: 'Grade Good (after the answer shows)', scope: 'Study', owner: 'FlashcardReviewClient' }`.

**Tests:** `study.spec.ts` asserts the budgets (median of 5), both with `reducedMotion: 'reduce'` (expected ~0 ms) and without. It also covers Space, Space, Space: reveal, grade Good, next card revealed.

### 5.8 FLOW-02 — Fix a card without leaving the session (1 day)

`E` (or an "Edit card" ghost button in the header, beside Pause) opens `EditCardSheet`: a dialog with `useModalDialog`, the §7.8 scrim, and two textareas labelled **Question** and **Answer**, mapped at the boundary (`question` → `back`, `answer` → `front`, with the naming-trap comment). Saving calls the existing `updateCard` (`card.ts:70`); the session card updates in place and the embedding re-syncs through the action's existing `after()`. **Delete card** in the sheet calls `deleteCard` after a confirm and removes the card from the queue. While the sheet is open the clock pauses (reuse `pause()`), and `pageShortcutBlocked` already keeps 1–4 and Space from firing behind it (KBD-01).

Suspend and bury, as Anki has them, need a card state the schema doesn't have. That's OD-6, not this phase.

Also fix the swapped validation messages at `schemas.ts:90–91`: "Question is required" guards `front`, which is the answer. The message should name the field the user sees, so `front` → "Answer is required" and `back` → "Question is required". Mirror it in `form-checks.ts`.

**Tests:** `study.spec.ts`: `E` → edit the answer → save → reveal shows the new text; the fixture client reads it back. `Escape` closes and focus returns to the card. Pressing `1` behind the open sheet does nothing.

### 5.9 MOB-05 — Swipe that says what it does (0.5 day)

While the card is dragged after the reveal, show the grade the release will commit: above the card, in the label step, "Again" (with a 2 px `--state-lapsed` tick) past −40 px, and "Good" (with `--state-mastered`) past +40 px. The label and the tick fill in as the drag passes the commit threshold (120 px, or the flick rule at `:946–947`). The matching grade key takes its `data-down` detent at the same moment, so the gesture and the keys read as one system. Below the threshold nothing is shown. The first revealed card on a coarse pointer shows "Swipe right for Good, left for Again" once (`localStorage` `cognit-hint-swipe`). Hard and Easy stay on the keys.

**Test:** `study.spec.ts` on `phone`: drag with `page.mouse` to +140 px, assert the "Good" label and the Good key's `data-down`, release, assert the next card.

### 5.10 Gate GU2

| Check | How | Pass |
|---|---|---|
| Unit and build | `npx tsc --noEmit && npm run lint && npm test && npm run build` | green; new: reducer, outbox, `studyLength`, `getStudyContinuation` |
| Bundle | `node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json` | `/dashboard/(focus)/[deckId]/study/page` within 199 kB (the split must not grow it) |
| Harness | `npx playwright test` | green, with the U2 assertions in `study.spec.ts`; the axe baseline for `/study` has no new rule |
| Latency | `study.spec.ts` | median reveal ≤ 200 ms, advance ≤ 300 ms (desktop project) |
| Card fit | `study.spec.ts` at 375 × 812 | the 300-character fixture fits; the 600-character one is cued |
| Screen reader (V3) | VoiceOver, macOS and iOS | hears "Card 1 of 5. Question: …", then "Answer: …" on Space, then "Graded Good…" |
| Phones (V6) | iOS Safari, Android Chrome | swipe shows its grade; a long card reads without hunting for a scroll; the header is one row; the band clears the home indicator |
| Undo (manual, 1 minute) | grade `1` on a card with a 20-day interval, press `Z` | the card is back, armed; after a Good, Stats and the deck show the old interval extended, not reset |
| Continuation | a deck with 23 due and a chunk of 10 | Keep going → Keep going → Next: *other deck* → Back to Today |
| Both themes | the canvas, the summary and the edit sheet | one `.raised` on the summary; no hue without a word |

---

## 6. Phase U3 — Today, and the words

**5–6 days**, with one migration (§6.1).

### 6.1 UX-06 — A day is the user's day (1.5 days)

**Capture the zone without an inline script.** A client component, `src/components/TimezoneCookie.tsx`, is mounted once in `src/app/dashboard/layout.tsx`. On mount it compares `Intl.DateTimeFormat().resolvedOptions().timeZone` with the `cognit-tz` cookie. If they differ, it writes `cognit-tz=<zone>; path=/; max-age=31536000; samesite=lax` and calls `router.refresh()` once. The first visit renders in UTC and corrects itself once; every later one is right on the first byte. It's bundled code, not an inline script, so the CSP's bridge and strict policies are untouched.

**Read it on the server.** `src/lib/timezone.ts`:

```ts
import { cookies } from 'next/headers';

export const TZ_COOKIE = 'cognit-tz';

/** The user's IANA zone from the cookie, or 'UTC'. Validated: an unknown zone makes `at time zone` raise, and the page's RPC would fail. */
export async function getRequestTimeZone(): Promise<string> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  if (!raw || raw.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return 'UTC';
  }
}

/** `YYYY-MM-DD` for `date` in `timeZone`: the day key the RPCs return. */
export function localDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
```

**Migration** `2026100?0900_local_day_rpcs.sql` (the next free timestamp). It's expand-only (Next Horizon §1.2.1): each RPC that buckets by day gets a **second signature whose `p_tz` has no default**, so PostgREST resolves `{p_user_id}` to the old function and `{p_user_id, p_tz}` to the new one, and nothing is ambiguous. The old signatures are dropped in a later contract migration, once no deployment calls them.

| RPC | Today | New signature adds |
|---|---|---|
| `get_study_activity_days` | `(created_at at time zone 'UTC')::date` (`202609011200:26`) | `p_tz text` · bucket `at time zone p_tz` · **`retention_reviews`** and **`retention_passed`** per day (the Stats definition: grade ≥ 3 on cards with `repetition_count > 0`), which Today sums over 30 local days for COPY-02 |
| `get_card_schedule_summary` | UTC due dates (`202609141000:41–50`) | `p_tz text` · local due dates · **`mastered_by_deck`** (`interval >= 21` per deck) for COPY-02 |
| `get_analytics_snapshot` | UTC days and weeks (`202609180900:47, 63, 73`) | `p_tz text` · `date_trunc('week', created_at at time zone p_tz)` · a scalar **`retention_30d`** (the same filter over the last 30 local days), which Stats' header reads instead of averaging four ISO weeks (`stats/page.tsx:83`) |
| `get_synthesis_insights` | UTC days (`202609270900:66–78`) | `p_tz text` |

```sql
-- The first of the four; the others follow the same pattern.
create or replace function public.get_study_activity_days(p_user_id uuid, p_tz text)
returns table (activity_date date, review_count integer, retention_reviews integer, retention_passed integer)
language sql
stable
security invoker
set search_path = public
as $$
  -- retention_*: the Stats definition (202609180900 retention_weekly): grades on
  -- cards past their first learning step, pass = grade >= 3. Summed over the
  -- last 30 local days by the caller.
  select (l.created_at at time zone p_tz)::date,
         count(*)::integer,
         (count(*) filter (where c.repetition_count > 0))::integer,
         (count(*) filter (where c.repetition_count > 0 and l.grade >= 3))::integer
    from public.study_logs l
    join public.cards c on c.id = l.card_id
   where l.user_id = auth.uid()
     and l.user_id = p_user_id
   group by 1
   order by 1 desc;
$$;

revoke all on function public.get_study_activity_days(uuid, text) from public;
revoke execute on function public.get_study_activity_days(uuid, text) from anon;
grant execute on function public.get_study_activity_days(uuid, text) to authenticated;
```

Revoke `anon` explicitly: Supabase's default privileges grant it (Next Horizon §4.5 and §6.7), and §11 lists the older RPCs still waiting for the same fix. Push sequence per Next Horizon §1.2.1: `node scripts/sqlcheck.mjs …` → `supabase db push --linked --dry-run` → push → `npm run db:types` → `npx tsc --noEmit`. Add the four probes to `scripts/verify-deployment.mjs`.

**Code.**
- `(shell)/page.tsx:314–366`: `today` and `yesterday` come from `localDayKey(now, tz)`, and the streak walk steps local day keys.
- `DueNowBand.tsx:12`, `ActivityHeatmap.tsx:17`, `LoadForecast.tsx:5`, `RetentionTrend.tsx:4` and `QuizHistoryList.tsx:17`: their `Intl.DateTimeFormat` takes `timeZone: tz`, passed as a prop from the server page, not `'UTC'`.
- `dashboard-forecast.ts:44–70`: `forecastWindowStartMs` and the day keys take `tz`.

**Tests.** `timezone.test.ts`: `localDayKey` at 2026-10-01T23:30Z is `2026-10-02` in `Asia/Manila` and `2026-10-01` in `America/New_York`; a bad cookie returns `UTC`. `dashboard-forecast.test.ts` gains a `tz` case. A harness spec sets `cognit-tz=Asia/Manila`, seeds one review at 23:30 UTC, and asserts Today's "Reviewed today" is 1 on the Manila day.

### 6.2 COPY-02 · COPY-06 · IA-02 — One meaning per word (1 day)

The glossary goes into the design system (Rev. F §9.7), and the code follows it:

| Word | Means | Only here |
|---|---|---|
| **Due** | studied, and its review time has passed | orange when > 0 |
| **New** | never studied | ink |
| **Mastered** | SM-2 interval ≥ 21 days | the one reading allowed `--state-mastered` |
| **Quiz-proven** | the card's last quiz answer was correct (`card_mastery_state.correct`) | ink, always |
| **Retention** | share of the last 30 days' reviews of seen cards graded Good or Easy | ink |
| **Recalled** | this session's Good + Easy, as "*n* of *m*" | ink |

| Site | Change |
|---|---|
| `GreetingHeader.tsx:92–95` "Retention" | **Retention** = the sum of `retention_passed` over the sum of `retention_reviews` for the last 30 local days (§6.1): the same filter and window as Stats' `retention_30d`, so the two numbers agree. "—" under 20 reviews. |
| `DeckRow.tsx:171–190` "Mastery" (quiz-proven, painted green) | **Mastered**: `mastered_by_deck / cards` from §6.1. The bar steps to `--state-mastered` at 70 %, which §7.5 intended, and now honestly. The legend at `:208` renames with it. |
| `DeckRow.tsx:65–71` `deckState` | `mastered` from the SM-2 share, not the quiz share |
| `DeckRow.tsx:150–160` "+2d" (COPY-06) | Move out of the due column: after the title, in the label step, "*2* drills". The due column shows cards only. |
| `DeckSessionLauncher` "Results update this deck's mastery score" | "Results update which cards are quiz-proven." |
| `FlashcardReviewClient` "Retention rate" | "Recalled" (§5.5) |
| `[deckId]/page.tsx:531–535` "Merge this deck" on Overview (IA-02) | Move into `DeckActions`' menu as "Merge into…", opening the same `MergeDeckDialog`. Overview loses the section. |

**Tests.** `DeckRow` state logic moves into `src/lib/deck-row.ts` as a pure `deckState()` with tests (due beats mastered; quiz-proven never yields `mastered`). A harness spec asserts that no element with the text "Retention" on Today disagrees with Stats' "Retention · 30d" for the fixture account.

### 6.3 FLOW-04 — Onboarding: the fastest path gets the fill (0.5 day)

`DashboardOnboarding.tsx`:
- Drop the "Step 1/2/3" eyebrows (`:165`). The three are **alternatives**: label them "Fastest", "From your material" and "By hand".
- Move the one filled button to the first starter deck. The PDF button becomes default-variant.
- Honest costs: "~5 s", "about a minute", "a few minutes".
- **Shorten the PDF path.** "New deck from a PDF" opens `CreateDeckModal` with `intent: 'pdf'` (the named event takes a detail). After creation, the modal routes to `/dashboard/<id>?add=pdf`, and `AddContentPanel` renders `PDFUploadZone` **first** and focuses its drop zone. That's one fewer scroll, and the path ends where the user said they were going.

**Test (harness, local mode):** global setup creates a second local user with no decks. That account sees the three options. The starter button is the only `data-variant="primary"` on the page. One click lands on `/study` with a card showing (the time-to-first-review spec: under 5 s on CI).

### 6.4 FLOW-06 — An honest PDF wait (0.5–1 day)

What can be fixed without re-architecting generation:

1. **Enrichment moves to the server.** `generateCards` schedules `enrichCards` with `after(() => runBackground('pdf_enrich', …))` once cards are saved, instead of the client firing it after the response (`PDFUploadZone.tsx:154–159`). It's best-effort inside the page's 60 s `maxDuration`. When generation used most of its 48 s the enrichment may not finish, and the quiz's on-demand enrichment (`QuizAssessmentClient.tsx:310–345`) remains the fallback, as now. Delete the client call. (`after()` needs the session headroom call LC-02 introduced: `await ensureSessionHeadroom()` first.)
2. **Say how long, and count.** Replace "This usually takes under a minute for a chapter." with "Usually 20–60 seconds on the free tier. Long PDFs are read in sections; if time runs out, the finished sections are saved." Beside "Working", an elapsed counter in mono (`23 s`, ink, §2.2e), `aria-hidden`, with the live region announcing only "Still working" at 20 s and "Almost at the limit" at 40 s (the A11Y-03 pattern).
3. **Guard the tab.** A `beforeunload` listener while `isGenerating` (the study page's pattern). Navigating inside the app is allowed: the action finishes, its toast still fires (sonner is global), and after (1) the cards are enriched either way. Say so under the counter: "You can leave this page. The cards will be in this deck."
4. **Replace the indeterminate bar** (a `repeat: Infinity` Framer loop, `:295–299`, per-frame on an authenticated surface, §1.1) with the counter. Nothing animates.

**Per-section progress and a real cancel** need the client to drive the sections: one server action per section, each with its own 60 s budget. That also removes today's 48 s ceiling on long PDFs. It's about 2 days, so it's OD-8, not this phase.

**Tests.** A Vitest test that `generateCards` schedules `pdf_enrich` through `after` (mocked, as `ai-generate.test.ts` already mocks the model). A harness spec (with `E2E_FAKES=1` returning after 3 s) asserts the counter ticks, the live region speaks once, and there's no `repeat: Infinity` animation (`document.getAnimations().length === 0` inside the scrim). **Manual (V4):** leave mid-generation by the breadcrumb, and by closing the tab. Record whether the cards exist and are quiz-ready.

### 6.5 FB-01 — One undo model: act now, commit later (0.5 day)

Card deletion joins the deck and drill model, without a schema change. **Hide immediately, commit after the toast.**

- `FlashcardWithActions` delete and `DeckCardsManager` bulk delete: remove the confirm dialog. The rows disappear at once and a toast reads "*3* cards deleted · Undo" for 6 s. The server call (`deleteCard` / `bulkDeleteCards`) runs when the toast closes, or on `pagehide`. Undo puts the rows back and never calls the server.
- If the server call fails, the rows return with an error toast. If the tab closes inside the window, nothing is deleted, which is the safe direction.
- Keep a confirm dialog only above **50** cards at once, where a toast is too small a warning.

**Tests.** `pending-delete.test.ts` (fake timers: commit after 6 s; undo cancels; `pagehide` flushes). Harness: delete a fixture card, Undo, reload, the card exists; delete, wait 7 s, reload, it's gone.

### 6.6 COPY-05 · PERF-08 — Voice, error copy, loading states (0.5–1 day)

**Voice.** Sentence case for every button and heading; no exclamation marks; a toast states the fact.

| Site | Before | After |
|---|---|---|
| `LoginClient.tsx:163` | Reset email sent! | Check your email for a reset link. |
| `LoginClient.tsx:207` | Check your email! | (the action's own message; drop the fallback's "!") |
| `PDFUploadZone.tsx:144` | *n* cards generated and saved! | *n* cards added to this deck. |
| `FlashcardReviewClient.tsx:711` | You're all caught up! | Nothing due in this deck |
| `:759–764` | Start New Session · Resume Session · Back to Deck | Start over · Resume · Back to deck |
| `:913` | Review Again | (removed, §5.5) |
| `QuizAssessmentClient.tsx:723, 746, 1044` | Quiz Result · Avg. per Question · Quit Quiz | Quiz result · Avg. per question · Quit quiz |
| `CreateDeckModal.tsx:87` | Deck created successfully | (none: the page navigates to the deck) |

Add a Vitest test that scans `src/**/*.tsx` string literals passed to `toast.*` and fails on a trailing `!`.

**Error boundaries.**
- `dashboard/error.tsx:48`: "This deck failed to load" becomes "This page failed to load". The boundary catches every dashboard route, not only decks.
- Both boundaries: drop "The error has been logged." Show "If it keeps happening, quote this reference:" only when `error.digest` exists. A digest means a server error, which Vercel's logs hold. A client error has no digest and isn't logged anywhere a person can read, until U5.

**Loading states (PERF-08).** Add `src/app/s/[token]/loading.tsx` (the header frame and a three-card skeleton grid) and `src/app/explore/loading.tsx` (the header and five row skeletons). Wrap the share page's deck read in React `cache()` (keyed by token), so `generateMetadata` and the page share one query instead of two.

### 6.7 IA-04 — Find a card by its words (0.5 day)

- **Cards tab:** a filter field above the list (`type="search"`, 44 px under a coarse pointer, 16 px text below `sm`). Typing (debounced 200 ms) calls a new `searchDeckCards(deckId, q)` in `card.ts`, which runs one RLS-scoped query: `` .or(`front.ilike.*${q}*,back.ilike.*${q}*`) `` on the deck's cards, capped at 60, with `q` stripped of PostgREST's reserved characters (`,()*`). An empty field restores the paged list. The count line reads "*n* matching “q”".
- **⌘K:** before the "Search card text" row, show up to five keyword matches across the user's decks (the same `ilike`, not scoped to a deck), each opening its deck's Cards tab filtered to the term. Semantic search stays as the explicit Enter row, for questions rather than words.
- No AI call and no migration. If card counts grow past a few thousand, a trigram index (`pg_trgm`, `gin (front gin_trgm_ops, back gin_trgm_ops)`) is the next step; it isn't needed at today's volume.

**Tests.** Vitest for the reserved-character stripping and the query builder. Harness: type a fixture term in the Cards tab, and exactly the matching fixture cards show; ⌘K lists the keyword match before the semantic row.

### 6.8 Gate GU3

| Check | How | Pass |
|---|---|---|
| Unit and build | `tsc`, lint, `npm test`, build | green; new: timezone, deck-row, pending-delete, the toast-voice scan, the enrichment scheduling |
| Migration | §1.2.1 sequence; `npm run verify:deployment` | four new signatures present, `anon` refused on each |
| Local days | harness spec with `cognit-tz=Asia/Manila` | "Reviewed today" and the streak count the Manila day |
| One Retention | harness | Today's Retention equals Stats' Retention · 30d |
| Mastered | a deck with 3 of 10 cards at interval ≥ 21 d and 10 of 10 quiz-proven | the row shows 30 % Mastered, ink bar |
| Onboarding | harness, new account | one primary button (the starter); one click to a card |
| PDF wait (V4) | real 25-card generation on production | counter visible, no looping animation, a leave-and-return shows quiz-ready cards |
| Undo | harness | card delete and bulk delete both undo; no confirm dialog under 51 cards |
| Voice | the toast scan in `npm test`; `rg -n "Start New Session\|Quit Quiz\|Avg\. per Question" src` | no matches |
| Loading | throttle to Slow 3G, open a share link | skeleton within the first flush, no blank page |
| Card search | harness | a fixture term finds its cards on the Cards tab and in ⌘K, with no network call to the AI actions |

---

## 7. Phase U4 — Design-system conformance

The debt behind the seeds, plus what the audit found. **3–3.5 days.** Apply Rev. E (SSP Appendix B) first if SSP's DSR-01 hasn't landed, then Rev. F (§9).

### 7.1 DS-08 — Chrome type steps become utilities (1 day)

```css
/* globals.css, beside the display utilities (:1257–1260).
 * Size only, except the label, which is a composite style. Colour is never
 * part of a type utility: compose it (`type-label text-ink-dimmer`).
 * `type-sm` / `type-cap` set font-size only, so they drop in for text-[13px] /
 * text-[12px] without changing an inherited line-height. */
@utility type-h3    { font-size: var(--type-h3); font-weight: 600; }
@utility type-body  { font-size: var(--type-body); }
@utility type-sm    { font-size: var(--type-sm); }
@utility type-cap   { font-size: var(--type-cap); }
@utility type-label {
  font-family: var(--font-mono);
  font-size: var(--type-label);
  line-height: 1.5;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
@utility type-study-lg { font-size: var(--type-study-lg); }
@utility type-study-md { font-size: var(--type-study-md); }
@utility type-study-sm { font-size: var(--type-study-sm); }
```

**A one-off codemod** (written in a scratch directory, not committed), run over `src/**/*.tsx`:

1. A class string containing `font-mono`, `text-[10px]`, `uppercase` and `tracking-[0.16em]` (in any order, with or without `leading-[1.5]`): drop those tokens and insert `type-label`. That's 140 strings in 65 files.
2. `text-[13px]` → `type-sm` (91), `text-[12px]` → `type-cap` (18), `text-[14px]` → `type-body` (2).
3. The 17 local `const LABEL` copies (rewritten by step 1 to `'type-label text-ink-dimmer'`) are inlined where a file uses them once, and otherwise kept.
4. Left for review, not rewritten: `text-[11px]` (8; the grade key's interval is 11 px by spec §7.4 and stays), `text-[15px]` (7; the drill slots, which become `type-body` at `sm:` after checking MOB-01's 16 px mobile rule still holds), and the remaining `text-[10px]` uses that aren't labels.

**Ratchet test:** `src/test/type-scale.test.ts` counts `text-\[\d+(\.\d+)?(px|rem)\]` across `src/**/*.tsx` and fails above a committed maximum. The maximum is the count after the codemod (expected ≈ 30, all of them reviewed exceptions), and every later change can only lower it. The 173 arbitrary `h-/w-/min-/max-[Npx]` classes are **not** codemodded: most are real geometry (a 104 px mastery bar, a 15 px mark). Control heights move into tokens instead (§9.4).

**Check:** screenshots from `screens.spec.ts` before and after, diffed per surface. A pure utility swap must produce **zero-pixel diffs** except where the label gained `line-height: 1.5` (strings that lacked `leading-[1.5]`); list those.

### 7.2 DS-09 · DS-10 — Display sizes on the scale (0.5 day)

Per OD-2 (recommended values; §9.2 records them):

| Site | Now | After |
|---|---|---|
| `GreetingHeader.tsx:74`, `[deckId]/page.tsx:386` (mobile `h1`) | `text-[1.8125rem]` (29 px) | `type-display-md` (28 px, **new**) `sm:type-display` |
| `Flashcard.tsx:132, 142` (preview faces) | `text-[27px]` | `type-study-md` (they're card faces) |
| `LoginClient.tsx:247` (the card specimen) | `text-[31px]` | `type-study-md` |
| `Wordmark` `sm` | `text-[27px]` | `type-display-md` |
| `Wordmark` `xl`, `2xl` | no consumers | **delete** |
| `SynthesisDrillClient.tsx:812` (drill prompt) | `text-[1.5rem]` | `type-display-sm` (24 px; exists in code, now documented) |
| `MCQMode.tsx:169`, `IdentificationMode.tsx:109` | `clamp(2.1rem, 3.3vw, 2.85rem)` | the study steps by length (§5.3) |
| `HeroSection.tsx:105` | `clamp(4.125rem, 7.5vw, 6.75rem)` | `type-hero` (**new**, landing only) |
| `HowItWorks.tsx:43`, `FeatureGrid.tsx:64` | `clamp(3rem, 4.5vw, 3.75rem)` | `type-display-lg` |

**Check:** `rg -n "font-serif" src | rg -v "type-(display|study|hero)"` returns only `globals.css`'s `.flip__body` rule.

### 7.3 VIS-01 · VIS-02 · VIS-03 — No game, no tilt, hue only for state (0.5 day)

- **VIS-01:** delete `quizBadges`, the `QuizBadge` type and their render block (`QuizAssessmentClient.tsx:255–290, 750–771`). Delete the letter-grade box (`:729–732`, OD-7). The result is "*80*%" and "*8* of *10* correct in *2m 10s*": the facts.
- **VIS-02:** `Flashcard.tsx` loses cursor tilt: `mouseX/Y`, both `useSpring`s, the `(hover: hover)` effect and the handlers (`:55–56, 58–75, 77–90, 104–108`). The flip stays, on `motionTransitions.flip`. The component comment changes from "marketing showpiece" to what it is: the preview card on the Cards tab and the share page.
- **VIS-03:** `QuizAssessmentClient.tsx:822`: "Correct answer" in `text-ink`. The miss is already marked by the row's lapsed tick. `SynthesisDrillClient.tsx:771`: the "Checking" tick becomes `state="neutral"`; the word "Checking" carries the meaning (§2.2e: waiting is time, not memory).

**Test:** a Vitest source scan fails on `Flawless|Speed Demon|Steady & Sure` and on `useSpring(` outside `motion-configs.ts`.

### 7.4 VIS-04 (quiz half) — The result has a subject (0.25 day)

The quiz result's score block (`:720–791`) becomes the screen's `.raised`: the percentage (`type-readout-sm`), "*n* of *m* correct in *t*", and the correct/missed counts as labelled numbers inside it. "Focus next" and "Question diagnostics" become `.well`s. The three stat tiles (`:735–748`) go; their numbers now sit inside the raised block. One primary action, as now.

### 7.5 A11Y-14 · A11Y-15 — Targets and nesting (0.75 day)

**One file fixes most targets.** In `button.tsx`, give touch pointers 44 px through Tailwind 4.1's `pointer-coarse:` variant (installed: 4.1.18):

```ts
size: {
  default: "h-[40px] px-4 text-sm pointer-coarse:h-[44px]",
  sm: "h-[32px] gap-1.5 px-3 type-sm pointer-coarse:h-[44px]",
  lg: "h-[44px] px-5 text-sm",
  icon: "size-[40px] pointer-coarse:size-[44px]",
  "icon-sm": "size-[32px] pointer-coarse:size-[44px]",
  "icon-lg": "size-[44px]",
},
```

Then the controls that aren't `Button`s:

| Control | Change |
|---|---|
| `DeckSessionLauncher` `CHIP` (`:37`), the count input (`:124`), Start quiz (`:204`); `SynthesisLauncher`'s chips and buttons | `h-[30px] pointer-coarse:h-[44px]` |
| `DeckRow` (`:111`) | `h-[38px] pointer-coarse:h-[48px]` (the link fills the row) |
| Login: "Forgot password?", "Sign up"/"Sign in" switch, "Show password", the theme toggle | 44 × 44 hit areas: `inline-flex min-h-11 min-w-11 items-center justify-center`, with the visual text unchanged; `ThemeToggle` `size-[34px] pointer-coarse:size-[44px]` |
| `PDFUploadZone` Remove | `min-h-11` under coarse pointers |

**A11Y-15:** the drop zone stops being a `div role="button"` that contains a button. Make the zone a `<label htmlFor="pdf-input">` around the prompt text, with the file input visually hidden but focusable (`sr-only`, **not** `hidden`), so Enter and Space open the picker natively. The Remove button then sits **outside** the label, below it.

**Check:** `targets.spec.ts` with an empty `targets-baseline.json` for every surface except inline prose links; axe `nested-interactive` absent.

### 7.6 A11Y-12 — Landmarks and the skip link (0.25 day)

| Page | Change |
|---|---|
| `MCQMode.tsx:158`, `IdentificationMode.tsx:98`, `synthesis/loading.tsx:24` | `<main>` → `<div>` (the focus layout owns `role="main"`) |
| `/` (`page.tsx:10`) | the outer `div` becomes `<main id="main-content">`; `Footer` stays outside it as `<footer>` |
| `/login`, `/login/update-password` | the form column is `<main id="main-content">` |
| `not-found.tsx:30` | `<main id="main-content">` |
| `s/[token]/page.tsx:93` | `div id="main-content"` → `<main id="main-content">` |

**Check:** axe `landmark-one-main`, `skip-link` and `region` are gone from the baseline on every public surface; the harness Tabs from the top of each page and asserts the skip link moves focus into `main`.

### 7.7 DS-10 — The document says what the code does

No code. Rev. F (§9) corrects §3.3's step names and roles, reconciles §4.2 and §7.2's button heights (32 / 40 / 44), and replaces §7.6's card size with the study steps. It lands with this phase so the document and the code agree on the same commit.

### 7.8 Gate GU4

| Check | How | Pass |
|---|---|---|
| Unit and build | `tsc`, lint, test, build | green; new: type-scale ratchet, gamification scan |
| Bundle | `bundle-report.mjs --budgets` | every route at or under its budget; `Flashcard` without springs should lower `/dashboard/[deckId]` and `/s/[token]`. Lower their budgets to the new size + 5 kB. |
| Visual | `screens.spec.ts` before and after 7.1 | zero-pixel diffs except the listed label line-heights |
| Serif scale | the `rg` in §7.2 | only `.flip__body` |
| Targets | `targets.spec.ts` | baseline empty (inline prose links excepted) |
| axe | `a11y.spec.ts` | no `landmark-*`, `region`, `skip-link`, `nested-interactive` anywhere |
| Both themes | Today, a deck (every segment), study, quiz result, login, landing | one `.raised` on each; no hue without a word; no badge |
| Phone (V6) | the deck launcher, login | every control ≥ 44 px under a finger |

---

## 8. Phase U5 — Measurement (PERF-09)

The goal is to know, without a third party, whether real users' screens are fast and where new users stop. **1.5 days.**

### 8.1 Web Vitals and client errors, first-party

- `src/components/Vitals.tsx` (client), mounted in the root layout. It uses `useReportWebVitals` from `next/web-vitals` and sends each metric with `navigator.sendBeacon('/api/vitals', …)`, batched per page. Same-origin, so the existing `connect-src 'self'` allows it on every route (`csp.ts:61`). It's bundled code, so no inline script and no new origin.
- The payload: `{ metric: 'LCP'|'INP'|'CLS'|'FCP'|'TTFB', value, rating, route, viewport: 'phone'|'tablet'|'desktop', nav: navigationType }`. `route` is the **route template** (`/dashboard/[deckId]/study`), taken from `useSelectedLayoutSegments`, never the URL, so no deck id or share token leaves the page. No user id, no IP stored, no cookie read.
- The error boundaries (`error.tsx`, `dashboard/error.tsx`) send `{ metric: 'error', route, digest?, message: error.message.slice(0, 200) }` the same way. That's what makes a client error "logged" (COPY-05).
- `src/app/api/vitals/route.ts`: `POST` only. It validates with a small hand-written check (not zod: PERF-02 kept zod off the client, and this runs on the server, so either is fine; match `form-checks.ts`), caps the body at 4 kB and 20 samples, drops unknown metrics, and inserts through the **signed-in user's** client when there is one. Anonymous samples (landing, login) are only logged with `logger.info('vitals', …)`, which keeps the table closed to anonymous writes.
- **Migration:** `rum_samples (id bigint generated always as identity, created_at timestamptz default now(), metric text, value double precision, rating text, route text, viewport text, nav text)`, with RLS: `insert` to `authenticated` with check `true`, **no `select` policy** (read it in the SQL editor). An index on `(route, metric, created_at)`. No `user_id` column, by design.
- **Reading it:** `supabase/verify/rum.sql`: p75 per route and metric over 7 days, and the share of `poor`.

### 8.2 The funnel, from tables that already exist

No new events. Every step of the first-run funnel is already a row: `auth.users.created_at` (sign-up), `email_confirmed_at` (confirmation), the first `decks.created_at` (first deck), the first `study_logs.created_at` (first review), and a `study_logs` row on a later local day (return). `supabase/verify/funnel.sql` computes, per signup week, the count reaching each step and the median time between steps. It runs in the SQL editor, where `auth.users` is readable. That's enough at today's volume, and it holds no data the app doesn't already have.

### 8.3 What this deliberately doesn't do

No session replay, no third-party analytics script, no per-user event stream. The design system's thesis ("trustworthy"), SSP SET-07's privacy notice and the CSP all argue against them. Revisit only if the funnel shows a drop that the tables can't explain.

### 8.4 Gate GU5

| Check | How | Pass |
|---|---|---|
| Unit and build | tests for the payload check (bad metric, oversized body, URL-shaped route rejected) | green |
| CSP | DevTools console on `/dashboard` and `/s/<token>` | no violations; the beacon is same-origin |
| Privacy | inspect one stored row | route template only, no id or token, no user column |
| Data | after a day of use, `supabase/verify/rum.sql` | rows for LCP, INP, CLS on `/dashboard`, `/dashboard/[deckId]`, `/dashboard/[deckId]/study` |
| Funnel | `supabase/verify/funnel.sql` | returns one row per signup week, with no error |

---

## 9. Design system Rev. F

Written against Rev. D **plus** SSP's Rev. E (SSP Appendix B). Nothing elsewhere in this plan departs from Rev. D except through the items below. Paste into `COGNIT_DESIGN_SYSTEM.md` when U4 lands; §9.3 and §9.5 are needed earlier, by U2, and can land with it.

### 9.1 Status and changelog

Append to **Status**: `· Rev. F (2026-10: study type by length, motion budgets, one glossary, local days, type utilities — COGNIT_UIUX_PLAN.md §9)`.

**Changelog (Rev. F):** The card face's size follows its text's length (§3.3, §7.6). Motion gets latency budgets and a shorter flip (§5). Chrome type steps get utilities (§3.3). A glossary fixes one meaning per word (§12, new). Days are local (§2.2e). The anti-pattern list names performance badges, invented numbers and all cursor tilt (§1.1). Accessible names must carry the content (§9). Control heights are tokens (§4.2). The document now matches the code on step names and button heights (DS-10).

### 9.2 §3.3 Scale: replace the code block and its rules

```css
/* display steps: Instrument Serif, weight 400 only */
--type-display-xl: 4.125rem;  /* 66px — login wordmark                         */
--type-display-lg: 3rem;      /* 48px — sparse-screen headings: empty states, errors, summaries, landing sections */
--type-display:    2.25rem;   /* 36px — app page title (h1) from sm            */
--type-display-md: 1.75rem;   /* 28px — app page title below sm; wordmark sm (Rev. F) */
--type-display-sm: 1.5rem;    /* 24px — the serif floor: the drill prompt   */
--type-hero: clamp(4.125rem, 7.5vw, 6.75rem); /* landing hero only (Rev. F)    */

/* study steps: Instrument Serif, by the text's length (Rev. F; replaces --type-study-body) */
--type-study-lg: clamp(2rem, 3.2vw, 2.75rem);      /* ≤ 110 characters */
--type-study-md: clamp(1.625rem, 2.4vw, 2.125rem); /* 111–240          */
--type-study-sm: 1.5rem;                           /* > 240, the floor  */

/* chrome steps: Geist Sans; unchanged values, now with utilities */
--type-h3 1rem · --type-body .875rem · --type-sm .8125rem · --type-cap .75rem · --type-label .625rem (mono, uppercase, .16em)

/* readout steps: unchanged */
```

Rules, added:
- Every size is read through a utility: `type-display*`, `type-hero`, `type-study-*`, `type-h3`, `type-body`, `type-sm`, `type-cap`, `type-label`, `type-readout*`. A restated `text-[Npx]` is a defect; `src/test/type-scale.test.ts` holds the ratchet.
- `type-label` is the complete label style (mono, 10 px, uppercase, 0.16em, 1.5). Compose colour separately.
- The card prompt measure is 36ch at `lg`, 44ch at `md`, 52ch at `sm`. (This replaces "the card prompt caps at 36ch".)

### 9.3 §7.6 FlipCard: replace the face's size, and add the overflow cue

Delete `font-size: clamp(1.5625rem, 2.4vw, 2.125rem)` and `max-width: 32ch` from the `.flip__face` spec (they contradicted §3.3). Add:

> The face's text size comes from `data-length` on `.flip__body` (`lg` / `md` / `sm`, from `studyLength()` in `src/lib/study-type.ts`). When the text still overflows, the face fades its last 32 px with a mask and the label step says "More below" under the card; the fade is a mask, not a colour. The face's accessible name is its text (§9).

### 9.4 §4.2 and §7.2: control heights

Replace §7.2's `height: 34px` and §4.2's `h-[40px]` note with one table:

| Token | Value | Used by |
|---|---|---|
| `--control-sm` | 32 px | `Button size="sm"`, `icon-sm` |
| `--control-md` | 40 px | `Button` default, `icon` |
| `--control-lg` | 44 px | `Button size="lg"`, inputs below `sm` |

Under a coarse pointer, every control is at least 44 px tall (`pointer-coarse:`). The grade keys stay 64 px below 640 px. `button.tsx` reads these as `h-(--control-sm)` and so on; §7.5's sketch shows pixel values only for clarity.

### 9.5 §5 Motion: budgets, and the one spring scoped

Replace the card rows of the table:

| Situation | Motion | Value |
|---|---|---|
| Card flip | Ease-in-out | **320 ms** `cubic-bezier(0.4, 0, 0.2, 1)`; the answer face shows at the midpoint |
| Commit flash | Ease-out | **120 ms** |
| Card leaving the stack | exit: opacity **90 ms linear** · enter: `y` **spring** (stiffness 260, damping 24), opacity **120 ms** ease-out · the new card does **not** wait for the old (`popLayout`) | |

Add:

> **Budgets.** Key → next prompt readable ≤ **300 ms**. Space → answer readable ≤ **200 ms**. `e2e/study.spec.ts` measures both (median of five), and a change that breaks them doesn't ship.
>
> **Loops.** On an authenticated surface nothing animates indefinitely except while something is loading: the skeleton shimmer (`.glass-skeleton`), and a spinner inside a control whose own request is in flight (`animate-spin`, as in the chat, share and clone buttons). Both stop under reduced motion. A progress indicator for a known wait is a counter, not a loop (the PDF bar, §6.4).

### 9.6 §1.1 Anti-pattern list: three rows

| Banned | Why | Instead |
|---|---|---|
| Badges, titles or letter grades for performance ("Flawless Victory") | A study instrument reports; it doesn't award | The score and the count |
| Numbers that aren't read from data (user counts, ratings, "in 30 seconds") | The thesis is *trustworthy* | A real count, or nothing |
| Cursor tilt **anywhere text is read**, including preview cards | Rev. C allowed it on a "showpiece"; both consumers are content | A static card; the flip only |

### 9.7 §12 (new): Glossary, one meaning per word

| Word | Means | Hue |
|---|---|---|
| **Due** | studied, and its review time has passed | `--state-due` when > 0 |
| **New** | never studied | none |
| **Learning** | in the learning or relearning steps (interval < 1 day) | `--state-learning` |
| **Mastered** | SM-2 interval ≥ 21 days | `--state-mastered` |
| **Quiz-proven** | the card's last quiz answer was correct | none |
| **Retention** | share of the last 30 days' reviews of seen cards graded Good or Easy | none |
| **Recalled** | this session's Good + Easy, as "*n* of *m*" | none |

A new user-facing metric gets a row here before it ships.

### 9.8 §2 Colour: three additions

- **§2.2e, append:** "A day is the user's local day. Streaks, 'today', heatmaps and forecasts bucket by the IANA zone in the `cognit-tz` cookie, never by UTC."
- **§2.3, append:** "Third-party brand marks keep their own colours where their guidelines require it (the Google 'G' on the sign-in button). Nothing else is exempt."
- **§10, append:** "Renderers that can't read CSS variables (`next/og` images) take the dark-theme values from `src/lib/og-palette.ts`, which mirrors `globals.css`. It's the one place a hex may appear outside `globals.css`."

### 9.9 §7.3 Kbd: the binding inventory

Add rows (each also goes in SSP's `SHORTCUTS` registry, SSP §7 standing rule):

| Key | Action | Where |
|---|---|---|
| `Space` / `Enter` after reveal | Grade Good | Study (OD-3) |
| `Z` (and `⌘Z` / `Ctrl+Z`) | Undo the last grade, within 6 s | Study |
| `E` | Edit the current card | Study |
| `Enter` | The summary's primary action | Study summary |

### 9.10 §9 Accessibility contract: two rules

- **A control's accessible name carries the content the user must read.** Instructions go in `aria-describedby`, never in an `aria-label` that replaces the content. (The study card was the case: A11Y-13.)
- **Touch targets:** ≥ 44 × 44 px under a coarse pointer; ≥ 24 × 24 px (WCAG 2.2 SC 2.5.8) under a fine one. Links inside running prose are exempt.

### 9.11 §11 Self-check: three items

> 16. Does every control's accessible name include the text the user has to read?
> 17. Is every number on the screen read from data?
> 18. Is every text size a utility, not `text-[Npx]`?

---

## 10. Owner decisions

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **OD-1** | Order relative to SSP | **U0 → U1 → SSP 0–1 → U2 → SSP 2–3 → U3 → U4 → U5** | U0 is cheap and public-facing; U1 automates both plans' gates; U2 is the biggest user gain and doesn't depend on SSP |
| **OD-2** | The display steps (seed S2) | **Add `--type-display-md` 28 px and a landing-only `--type-hero`; card previews and the login specimen use the study steps; delete `Wordmark` xl/2xl** | Every stray size lands on a named step, and only one new app step is needed |
| **OD-3** | Space/Enter grade Good after the reveal | **Yes**, with a one-time hint | Anki's one-key rhythm; the `event.repeat` guard prevents runaway grading |
| **OD-4** | What "Start session" studies | **The user's chunk (SSP SET-04, default 10), named on screen, with "Keep going" at the end** | Chunks give a 40-minute session its break points and respect the setting; honesty and continuation fix FLOW-01. Alternative: every due card up to 50 |
| **OD-5** | Landing social proof | **Delete** | Real counts are small today; show them when they're worth reading |
| **OD-6** | Suspend and bury, like Anki | **Not now** | Needs a new card state, a migration and a change to every due query. Edit-in-place (§5.8) covers the common case, a wrong AI card |
| **OD-7** | The quiz's letter grade | **Remove** | A letter grade is a judgement; the percentage and the count are the facts |
| **OD-8** | PDF generation, per section with cancel | **Later, as its own 2-day item** | Client-driven sections give true progress and a cancel, and lift the 48 s ceiling on long PDFs; U3 fixes the honesty without it |
| **OD-9** | Flip 520 → 320 ms, flash 160 → 120 ms | **Yes** | The computed cost today is about a minute per 50 cards (Appendix C.2); 320 ms still reads as a turn |
| **OD-10** | Privacy page | **Write one before reinstating footer legal links** | Uploaded PDFs go to Gemini's free tier. That notice belongs on a public page as well as in Settings (SSP SET-07). The text is the owner's to write |
| **OD-11** | Real-user metrics | **First-party `rum_samples` (§8.1)** | No new origin, no user id, data in the owner's own database. Vercel Speed Insights is the no-code alternative, if the plan's quota fits |

---

## 11. Out of scope

Recorded so they aren't lost. None is re-audited here.

- **AUTH-02:** the switch to ES256 signing keys is a Supabase dashboard change. The JWKS is still empty, so every navigation pays extra Auth round-trips.
- **CSP rollout:** the report-only week restarted on 2026-09-29; after a clean week, set `CSP_ENFORCE=true`. The signed-in `/dashboard` coverage check is still owed.
- **Database:** Phase 1's RPCs still grant `anon` EXECUTE (only the insights RPC revokes it); a small new migration is pending. §6.1's new signatures revoke `anon` themselves.
- **Gemini:** free-tier latency and quota; the privacy of user PDFs on the free tier; billing, or a model and queueing strategy; the unevaluated `ThinkingLevel.MINIMAL` option.
- **Deferred by the owner:** voice dictation (Next Horizon §4.4, with SEC-02), AUTH-03 and PERF-04.
- **Live gates never run:** `ai:calibrate`, the k6 load test, insights-RPC parity (production has no deck with 20 attempts yet) and the DB-03 HNSW check.
- **Noticed in passing:**
  - The share page calls `getSessionUser()` for every anonymous visitor (`s/[token]/page.tsx:84`), so each unfurl crawl and preview pays an Auth round-trip under AUTH-02.
  - The sharing policy (`is_public = true and share_token is not null`, `202609070910`) lets any client holding the public anon key list every shared deck, not only open one by its token (SSP §0.2 #5). SSP filters its own queries; the policy itself is unchanged, so a "link-only" share isn't private.
  - PDF-generated cards don't record the page they came from. RemNote links a card to its source highlight; that needs chunk page numbers in `ai-generate.ts` and a column.
  - Anki and RemNote now offer FSRS scheduling. Cognit's SM-2 is a product decision, not a UI one.
  - `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg` and `window.svg` are create-next-app leftovers with no references in `src/`.
  - The quiz and drill clients (1,050 and 995 lines) are split only when their own UX work arrives (REF-01, narrowed).
  - `LandingBackground`'s canvas loop is allowed on marketing surfaces (§7.10), but its CPU cost on a low-end phone was never measured.

---

## Appendix A — Screenshot index

Captured 2026-09-30 from `next start` of an APFS clone of `bc66b1d`, with system Chrome (headless) through `playwright-core`. File names are `<surface>__<width>__<theme>.png`, full-page. They live in the audit session's scratchpad, not the repo; Appendix D.1 regenerates them.

| Surface | Path | Widths × themes | Notes |
|---|---|---|---|
| `landing` | `/` | 375, 768, 1280 × light, dark | Full-page captures show the sections below the hero blank: `RevealOnScroll` hides them after hydration until they're scrolled into view. `landing__1280__dark__scrolled.png` and `__features.png` show them revealed; `__nojs.png` shows everything visible without JavaScript. |
| `login`, `login-signup` | `/login`, `/login?mode=signup` | all six | The brand half (left) appears from `lg` up |
| `update-password` | `/login/update-password` | all six | Signed out, it redirects to `/login?error=…` (correct) |
| `explore` | `/explore` (`EXPLORE_ENABLED=true`) | all six | IA-01: no frame; "No listed decks match." with no query |
| `notfound` | `/this-does-not-exist` | all six | |
| `share-missing` | `/s/not-a-real-token` | all six | The 404 page, after a database read |
| `dashboard-signedout` | `/dashboard` | 1280 × both | Redirects to `/login?redirectTo=%2Fdashboard` |
| `cardfit__<viewport>__pdf300` | reconstructed study canvas | 375×667, 375×812, 768×1024, 1280×800 | UX-07 before; `cardfit-after__…` after the §5.3 steps |
| *signed-in surfaces* | `/dashboard`, `/dashboard/stats`, `/dashboard/<id>?tab=…`, study, quiz, synthesis | — | **Not captured**: no test account (§1.5 V1) |

## Appendix B — Accessibility results

### B.1 axe (public surfaces)

axe-core via `@axe-core/playwright`, tags `wcag2a wcag2aa wcag21a wcag21aa wcag22aa best-practice`. Run at 375 and 1280 px in both themes; the counts were identical across themes and are the maximum nodes per rule.

| Surface | `landmark-one-main` | `skip-link` | `region` (nodes) | Anything else |
|---|---|---|---|---|
| `/` | 1 | 1 | 38 | none |
| `/login` | 1 | 1 | 18 (1280) · 8 (375) | none |
| `/login?mode=signup` | 1 | 1 | 18 · 8 | none |
| `/login/update-password` → `/login?error=…` | 1 | 1 | 18 · 8 | none |
| `/explore` | 0 | 0 | 0 | none |
| 404 | 1 | 1 | 2 | none |
| `/s/<missing>` | 1 | 1 | 2 | none |
| `/dashboard` (signed out → login) | 1 | 1 | 18 | none |

**Zero** `color-contrast`, `aria-*`, `button-name`, `link-name`, `label`, `image-alt` or `nested-interactive` violations on any public surface, in either theme. Console: the 404 routes log the expected 404 resource error, and nothing else.

### B.2 Touch targets at 375 px (public surfaces)

Bounding boxes of every visible interactive element (`targets.mjs`, Appendix D.2). DS §9 asks for 44 × 44; WCAG 2.5.8 asks for 24 × 24.

| Surface | Targets | < 44 px | < 24 px | Smallest |
|---|---|---|---|---|
| `/` | 20 | 18 | 12 | the footer links, 18 px tall (removed by U0, §3.1); the skip link (1 × 1 until focused, correct) |
| `/login` | 11 | 9 | 3 | "Forgot password?" 101 × 16 · "Sign up" 50 × 20 · "Show password" 26 × 26 · theme toggle 34 × 34 · Sign in 285 × 40 · Google 137 × 40 |
| `/explore` | 2 | 1 | 1 | the skip link only; the search field is 44 px |
| 404 | 4 | 4 | 1 | "Go to your decks" 147 × 40 · "Home" 72 × 40 |

### B.3 The study card's accessible name

The markup `FlipCard` renders in its interactive branch, loaded in Chrome, with the accessibility tree read over CDP (`Accessibility.getFullAXTree`):

```
button: "Showing the question. Press to reveal the answer."
  StaticText: "What is the powerhouse of the cell?"
```

The name is the `aria-label`. The card's text is a descendant of a `button`, whose children ARIA treats as presentational; screen readers announce a focused button by its name. Confirm with VoiceOver (§1.5 V3).

## Appendix C — Measurements

### C.1 Card fit on the study canvas (UX-07)

The study page's markup (header, eyebrow, card, reveal hint, grade band), reconstructed from `FlashcardReviewClient.tsx`, rendered inside a live page from the production build, so the compiled CSS and the `next/font` Instrument Serif apply. Four prompts: the starter decks' median (97 characters) and maximum (133), and two PDF-length definitions (300 and 600). The generator's schema asks for "a factual 1–3 sentence definition"; there's no production sample to measure, since production holds a handful of decks.

**Before (`bc66b1d`)**

| Viewport | Prompt | Font | Chars/line | Lines | Visible | Hidden |
|---|---|---|---|---|---|---|
| 375 × 667 | 97 | 37.6 px | 19 | 5 | 5 | 1 px |
| 375 × 667 | 133 | 37.6 | 19 | 7 | 5 | 58 px |
| 375 × 667 | 300 | 37.6 | 23 | 13 | 5 | 340 px |
| 375 × 667 | 600 | 37.6 | 21 | 29 | 5 | 1,092 px |
| 375 × 812 | 97 | 37.6 | 19 | 5 | 5 | 1 px |
| 375 × 812 | 133 | 37.6 | 19 | 7 | 6 | 26 px |
| 375 × 812 | 300 | 37.6 | 23 | 13 | 6 | **308 px** |
| 375 × 812 | 600 | 37.6 | 21 | 29 | 6 | 1,060 px |
| 768 × 1024 | 300 | 37.6 | 43 | 7 | 7 | 1 px |
| 768 × 1024 | 600 | 37.6 | 46 | 13 | 7 | 257 px |
| 1280 × 800 | 97 | 46.1 | 32 | 3 | 3 | 0 |
| 1280 × 800 | 300 | 46.1 | 38 | 8 | 5 | 133 px |
| 1280 × 800 | 600 | 46.1 | 38 | 16 | 5 | 594 px |

**After (the §5.3 steps, applied as inline styles to the same markup)**

| Viewport | Prompt | Font | Lines | Visible | Hidden |
|---|---|---|---|---|---|
| 375 × 667 | 133 | 26 px | 4 | 5 | 0 |
| 375 × 667 | 300 | 24 | 9 | 8 | 9 px (cued) |
| 375 × 812 | 97 | 32 | 4 | 4 | 0 |
| 375 × 812 | 133 | 26 | 4 | 5 | 0 |
| 375 × 812 | 300 | 24 | 9 | 9 | **0** |
| 375 × 812 | 600 | 24 | 17 | 9 | 226 px (cued) |
| 768 × 1024 | 600 | 24 | 10 | 10 | 0 |
| 1280 × 800 | 300 | 24 | 5 | 5 | 0 |
| 1280 × 800 | 600 | 24 | 10 | 10 | 0 |

In every case the grade band stays on screen with no page scroll.

### C.2 How long a grade takes (PERF-06)

framer-motion **12.34.3**'s own `spring` generator (`import { spring } from 'framer-motion'`, run in the clone's `node_modules`) with `cardLeaveSpring` (stiffness 260, damping 24, mass 1) and framer's rest thresholds (0.5 / 2 for `y`; 0.005 / 0.01 for opacity):

| Segment | Time |
|---|---|
| Commit flash (`COMMIT_FLASH_MS`) | 160 ms |
| Exit settles (opacity 1 → 0 reaches rest; `mode="wait"` holds the next card until it does) | 556 ms (`y` alone: 451 ms) |
| Enter: opacity ≥ 0.95, and `y` within 1 px | 193 ms / 195 ms |
| Enter fully at rest | 556 ms |
| **Key → next prompt readable** | **≈ 909 ms** |
| Key → at rest | ≈ 1,272 ms |
| Space → answer face visible (half of `--dur-flip`) | 260 ms |
| Space → flip complete | 520 ms |

A card therefore spends about 1.2 s (readable to readable) to 1.8 s (at rest to at rest) in animation; over 50 cards that's roughly 1 to 1.5 minutes. `studytiming.mjs` (Appendix D.3) measures the same thing live against a seeded deck.

### C.3 Bundles (`bc66b1d`, gzip first-load JS)

```
route                                          chunks   raw kB   gz kB  budget
/dashboard/(shell)/[deckId]/page                   18      756   234.9  ≤ 240 ✓
/dashboard/(shell)/page                            18      683   212.4  ≤ 218 ✓
/dashboard/(focus)/[deckId]/synthesis/page         17      675   207.2  ≤ 213 ✓
/dashboard/(focus)/[deckId]/quiz/page              17      640   196.6  ≤ 202 ✓
/dashboard/(focus)/[deckId]/study/page             16      628   193.5  ≤ 199 ✓
/dashboard/(shell)/stats/page                      16      628   192.7  ≤ 198 ✓
/login/page                                        15      610   186.3  ≤ 192 ✓
/s/[token]/page                                    16      602   185.4  ≤ 191 ✓
/page                                              15      600   182.7  ≤ 188 ✓
/login/update-password/page                        15      597   182.1  ≤ 188 ✓
/_not-found/page                                   13      551   165.0
/explore/page                                      13      551   165.0
/_global-error/page                                 7      431   125.1
All routes within budget.
```

`/explore` has no budget. Add one (170 kB) when IA-01 lands, so the directory's frame can't grow unnoticed.

### C.4 Production (https://cognit-nine.vercel.app, 2026-09-30)

| Request | Status | TTFB (3 runs) | Notes |
|---|---|---|---|
| `/` | 200 | 1.30 · 0.76 · 0.54 s | 61 kB HTML, `x-vercel-cache: HIT` |
| `/login` | 200 | 0.81 · 0.51 · 0.67 s | 17 kB |
| `/explore` | 404 | 1.12 · 0.39 · 0.36 s | flag off, correct |
| `/s/not-a-real-token` | 404 | 1.20 · 0.50 · 0.51 s | two identical deck reads (PERF-08) |
| `/dashboard` (signed out) | 307 | 0.27 · 0.21 · 0.24 s | |
| `https://cognit.app/og-image.png` | — | connection failed | FLOW-07 |
| `https://cognit-nine.vercel.app/og-image.png` | 404 | | FLOW-07 |

The home page's meta tags: `og:url` `https://cognit.app`, `og:image` and `twitter:image` `https://cognit.app/og-image.png`.

### C.5 Code counts (S1)

```bash
rg -o 'text-\[[0-9.]+px\]' src | wc -l
```
→ **282**. By size: 144 × 10 · 91 × 13 · 18 × 12 · 8 × 11 · 7 × 15 · 3 × 27 · 2 × 14 · one each of 17, 31, 64, 66, 80, 84, 98, 104, 124.

```bash
rg -o '\b(h|w|min-h|min-w|max-h|max-w)-\[[0-9.]+px\]' src | wc -l
```
→ **173**. The label style: 140 class strings containing all of `font-mono`, `text-[10px]`, `uppercase`, `tracking-[0.16em]`, in 65 files, plus 17 local `const LABEL` copies. Toasts: 103 calls (64 `error`, 31 `success`, 4 `warning`, 4 `info`).

### C.6 Journeys: what was walked, and what is owed

Signed out, the journeys were walked live: landing → the sign-up form (one click), the share-link 404, `/explore`, the 404 page, and the signed-out redirect. Signed in, they could only be traced through code. The table counts the **interactions** each path needs today, and what it will need after this plan. Timing them is V7 (§1.5).

| Journey | Today (from code) | After |
|---|---|---|
| First run → first review, starter deck | Start free · email · password · Create account · *confirm by email* · starter deck → first card (**5 + email**) | unchanged; already the best path |
| First run → first review, PDF | … confirm · New deck, then upload · title · Create · *scroll to the PDF zone* · choose file · Generate · *wait 2–48 s* · Review flashcards (**≈ 8 + typing + wait**) | the PDF zone opens first and focused (−1 scroll); an honest wait |
| Daily return, 47 due across 3 decks at 10 per chunk | S · (Space, grade) × 10 · Back to deck · Decks · next deck · R … (**3–4 navigation steps per chunk**, ×5 chunks) | S · (Space, Space) × 10 · **Enter** per chunk |
| A mis-graded card | not recoverable | `Z` |
| A wrong AI card, mid-session | Save & exit · Cards tab · find · edit · save · restart | `E` · edit · save |
| Share link → sign up → save | … Save this deck · sign up · confirm · *lands on Today; the deck is lost* | lands back on the deck |

## Appendix D — Scripts

All of these lived in the audit's scratchpad, never in the repo. `playwright-core` drives the system Chrome (`channel: 'chrome'`), so no browser download is needed. Install beside them with `npm i playwright-core @axe-core/playwright axe-core`.

### D.1 `capture.mjs`: screenshots, axe and timing per surface

Run: `node capture.mjs public.json`. For signed-in surfaces, add `"cookie": "<output of node --env-file=.env.local scripts/k6-session.mjs>"` to the config, with the surfaces from §4.3 `surfaces.ts`.

```js
// Screenshot + axe + timing capture for Cognit surfaces.
// Usage: node capture.mjs <config.json>
// config: { base, outDir, cookie?, surfaces: [{ name, path, widths?, themes?, axe?, waitFor?, actions? }] }
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = cfg.outDir;
fs.mkdirSync(outDir, { recursive: true });
const WIDTHS = cfg.widths ?? [375, 768, 1280];
const THEMES = cfg.themes ?? ['light', 'dark'];
const HEIGHTS = { 375: 812, 768: 1024, 1280: 800 };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

function cookiesFor(base) {
  if (!cfg.cookie) return [];
  const url = new URL(base);
  return cfg.cookie.split('; ').map((pair) => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: url.hostname, path: '/', httpOnly: false, secure: url.protocol === 'https:', sameSite: 'Lax' };
  });
}

for (const surface of cfg.surfaces) {
  const widths = surface.widths ?? WIDTHS;
  const themes = surface.themes ?? THEMES;
  for (const theme of themes) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHTS[width] ?? 900 },
        colorScheme: theme,
        deviceScaleFactor: 1,
        hasTouch: width < 768,
        isMobile: width < 768,
        reducedMotion: surface.reducedMotion ? 'reduce' : 'no-preference',
      });
      await context.addInitScript((t) => { try { localStorage.setItem('cognit-theme', t); } catch {} }, theme);
      const cookies = cookiesFor(cfg.base);
      if (cookies.length) await context.addCookies(cookies);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
      page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 300)));
      const url = cfg.base + surface.path;
      const t0 = Date.now();
      let status = null;
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        status = resp?.status() ?? null;
      } catch (e) {
        consoleErrors.push('goto: ' + String(e).slice(0, 200));
      }
      const loadMs = Date.now() - t0;
      if (surface.waitFor) { try { await page.waitForSelector(surface.waitFor, { timeout: 15000 }); } catch {} }
      if (surface.actions) {
        for (const a of surface.actions) {
          try {
            if (a.click) await page.click(a.click, { timeout: 5000 });
            if (a.press) await page.keyboard.press(a.press);
            if (a.type) await page.keyboard.type(a.type);
            if (a.wait) await page.waitForTimeout(a.wait);
          } catch (e) { consoleErrors.push('action: ' + String(e).slice(0, 160)); }
        }
      }
      await page.waitForTimeout(surface.settle ?? 600);
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return nav ? { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null } : null;
      }).catch(() => null);
      const docW = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => null);
      const base = `${surface.name}__${width}__${theme}`;
      await page.screenshot({ path: path.join(outDir, base + '.png'), fullPage: surface.fullPage ?? true }).catch((e) => consoleErrors.push('shot: ' + e));
      let axe = null;
      const runAxe = surface.axe !== false && (width === 375 || width === 1280);
      if (runAxe) {
        try {
          const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
          axe = r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')), summary: v.nodes[0]?.failureSummary?.slice(0, 300) }));
        } catch (e) { axe = [{ id: 'axe-error', n: 0, summary: String(e).slice(0, 200) }]; }
      }
      results.push({ surface: surface.name, path: surface.path, width, theme, status, loadMs, timing, overflowX: docW && docW > width ? docW : null, consoleErrors, axe, finalUrl: page.url() });
      console.log(base, status, loadMs + 'ms', axe ? `axe:${axe.reduce((s, v) => s + v.n, 0)}` : '', docW > width ? `OVERFLOW ${docW}` : '', consoleErrors.length ? `errs:${consoleErrors.length}` : '');
      await context.close();
    }
  }
}
await browser.close();
const resFile = path.join(outDir, `results-${cfg.tag ?? 'run'}.json`);
fs.writeFileSync(resFile, JSON.stringify(results, null, 2));
console.log('wrote', resFile);
```

The public run's config:

```json
{ "base": "http://localhost:3100", "outDir": "./shots", "tag": "public",
  "surfaces": [
    { "name": "landing", "path": "/", "settle": 1500 },
    { "name": "login", "path": "/login" },
    { "name": "login-signup", "path": "/login?mode=signup" },
    { "name": "update-password", "path": "/login/update-password" },
    { "name": "explore", "path": "/explore" },
    { "name": "notfound", "path": "/this-does-not-exist" },
    { "name": "share-missing", "path": "/s/not-a-real-token" },
    { "name": "dashboard-signedout", "path": "/dashboard", "widths": [1280] }
  ] }
```

### D.2 `targets.mjs`: touch targets at 375 px

Run: `OUT=targets.json node targets.mjs http://localhost:3100 - / /login /explore`. Pass a file holding the cookie instead of `-` for signed-in paths.

```js
// Touch-target audit at 375 px: every visible interactive element under 44 px (DS §9) and under 24 px (WCAG 2.5.8).
// Usage: node targets.mjs <base> <cookie-file|-> <path> [<path> …]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [base, cookieFile, ...paths] = process.argv.slice(2);
const cookie = cookieFile && cookieFile !== '-' ? fs.readFileSync(cookieFile, 'utf8').trim() : '';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = {};
for (const p of paths) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  if (cookie) {
    const host = new URL(base).hostname;
    await context.addCookies(cookie.split('; ').map((pair) => { const i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: '/' }; }));
  }
  const page = await context.newPage();
  await page.goto(base + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(800);
  out[p] = await page.evaluate(() => {
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=option], [tabindex]:not([tabindex="-1"])';
    const rows = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.closest('[inert]') || el.closest('[aria-hidden=true]')) continue;
      const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      rows.push({ tag: el.tagName.toLowerCase(), label, w: Math.round(r.width), h: Math.round(r.height) });
    }
    const small = rows.filter((r) => r.h < 44 || r.w < 44);
    const tiny = rows.filter((r) => r.h < 24 || r.w < 24);
    return { total: rows.length, under44: small.length, under24: tiny.length, worst: small.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).slice(0, 14) };
  });
  console.log(p, JSON.stringify({ total: out[p].total, under44: out[p].under44, under24: out[p].under24 }));
  await context.close();
}
await browser.close();
fs.writeFileSync(process.env.OUT ?? 'targets.json', JSON.stringify(out, null, 2));
```

### D.3 `studytiming.mjs`: reveal and advance latency, live (V2)

Run against a deck with at least six cards: `node studytiming.mjs http://localhost:3100 cookie.txt <deckId> 6`, then again with a fifth argument `reduced`. It grades with `3`, so use the fixture account.

```js
// Measures the study loop's own latency: reveal (Space → answer face visible and the flip settled)
// and advance (grade key → next prompt readable and settled). Grades with '3' (Good).
// Usage: node studytiming.mjs <base> <cookie-file> <deckId> <cards> [reduced]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [base, cookieFile, deckId, n = '6', reduced] = process.argv.slice(2);
const cookie = fs.readFileSync(cookieFile, 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', reducedMotion: reduced ? 'reduce' : 'no-preference' });
const host = new URL(base).hostname;
await context.addCookies(cookie.split('; ').map((pair) => { const i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: '/' }; }));
const page = await context.newPage();
const t0 = Date.now();
await page.goto(`${base}/dashboard/${deckId}/study?count=${n}&scope=include_reviewed`, { waitUntil: 'networkidle' });
console.log('study page load (networkidle):', Date.now() - t0, 'ms');
// Clear any resume prompt.
const startNew = page.getByRole('button', { name: /start new session/i });
if (await startNew.count()) { await startNew.click(); await page.waitForTimeout(500); }

await page.evaluate(() => {
  window.__settled = (predicate, timeout = 5000) => new Promise((resolve) => {
    const start = performance.now();
    let stableSince = null;
    const tick = () => {
      const ok = predicate();
      const now = performance.now();
      if (ok) { stableSince ??= now; if (now - stableSince >= 34) return resolve(Math.round(stableSince - start)); }
      else stableSince = null;
      if (now - start > timeout) return resolve(-1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const panel = () => document.querySelector('.flip__panel');
  window.__revealDone = () => {
    const p = panel(); if (!p) return false;
    const m = new DOMMatrixReadOnly(getComputedStyle(p).transform);
    const ans = document.querySelector('.flip__face--answer');
    // rotateY(180) → m11 ≈ -1
    return ans && getComputedStyle(ans).visibility === 'visible' && m.m11 < -0.999;
  };
  window.__promptReady = (prevText) => {
    const card = document.querySelector('.flip');
    const promptFace = document.querySelector('.flip__face--prompt');
    if (!card || !promptFace) return false;
    const wrapper = card.closest('[style*="opacity"]') ?? card.parentElement?.parentElement?.parentElement;
    const op = wrapper ? Number(getComputedStyle(wrapper).opacity) : 1;
    const txt = promptFace.innerText.trim();
    const p = panel(); const m = p ? new DOMMatrixReadOnly(getComputedStyle(p).transform) : null;
    const rect = card.getBoundingClientRect();
    return txt && txt !== prevText && getComputedStyle(promptFace).visibility === 'visible' && op > 0.999 && m && m.m11 > 0.999 && Math.abs(rect.top - (window.__restTop ?? rect.top)) < 0.5;
  };
});

const reveals = [];
const advances = [];
for (let i = 0; i < Number(n) - 1; i++) {
  const restTop = await page.evaluate(() => document.querySelector('.flip')?.getBoundingClientRect().top);
  await page.evaluate((t) => { window.__restTop = t; }, restTop);
  const revealP = page.evaluate(() => window.__settled(window.__revealDone));
  await page.keyboard.press('Space');
  reveals.push(await revealP);
  const prevText = await page.evaluate(() => document.querySelector('.flip__face--prompt')?.innerText.trim());
  const advP = page.evaluate((prev) => window.__settled(() => window.__promptReady(prev)), prevText);
  await page.keyboard.press('3');
  advances.push(await advP);
  await page.waitForTimeout(300);
}
const med = (a) => { const s = a.filter((x) => x >= 0).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(JSON.stringify({ reduced: Boolean(reduced), reveals, advances, medianReveal: med(reveals), medianAdvance: med(advances) }));
await page.screenshot({ path: process.env.SHOT ?? 'study-after.png' });
await browser.close();
```

### D.4 `cardfit.mjs`: card text on the study canvas (C.1)

Run with the production server on :3100: `node cardfit.mjs <screenshot dir>`. The "after" numbers came from the same script with the §5.3 sizes set as inline styles on `#body` before measuring.

```js
// Renders the study canvas markup (reconstructed from FlashcardReviewClient.tsx at bc66b1d) inside a live
// production page, so the app's own compiled CSS and next/font faces apply, and measures how card text fits.
import { chromium } from 'playwright-core';

const TEXTS = {
  starterMedian: 'How the running time of an algorithm scales with input size, usually expressed in Big-O notation.',
  starterMax: 'A loop or index that runs one step too many or too few, typically from confusing `<` with `<=` or zero-based with one-based counting.',
  pdf300: 'The process by which a cell copies its DNA before division. Each strand of the double helix serves as a template, so every new molecule contains one original strand and one newly synthesised strand, which is why the mechanism is called semi-conservative replication.'.padEnd(300, ' x'),
  pdf600: ('In the Krebs cycle, acetyl-CoA combines with oxaloacetate to form citrate, which is progressively oxidised through a series of intermediates; each turn yields three NADH, one FADH2 and one GTP, and regenerates oxaloacetate so the cycle can continue. The electron carriers then feed the electron transport chain on the inner mitochondrial membrane, where oxidative phosphorylation produces most of the cell\'s ATP.').padEnd(600, ' and so on'),
};

const shell = (text) => `
<div class="flex min-h-[100dvh] flex-col bg-bg">
 <div class="flex flex-1 flex-col">
  <header class="flex-none p-4 md:px-8 md:pt-6 space-y-3">
   <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <button class="inline-flex items-center gap-2 h-[32px] px-2 text-[13px]">← Save &amp; exit</button>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
     <div class="flex items-baseline gap-2"><span class="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Deck</span><span class="max-w-[10rem] truncate text-[13px] leading-none text-ink sm:max-w-[16rem]">Cell biology — lecture 4</span></div>
     <div class="flex font-mono items-baseline gap-2"><span class="text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Card</span><span class="text-[13px] leading-none tnum">3/10</span></div>
     <div class="flex font-mono items-baseline gap-2"><span class="text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Ease</span><span class="text-[13px] leading-none tnum">2.50</span></div>
     <div class="flex font-mono items-baseline gap-2"><span class="text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Elapsed</span><span class="text-[13px] leading-none tnum">1m 12s</span></div>
     <button class="inline-flex items-center gap-2 h-[32px] px-2 text-[13px]">Pause <span class="kbd">P</span></button>
    </div>
   </div>
   <div class="h-px w-full bg-border"></div>
  </header>
  <div class="flex flex-1 items-center justify-center p-4 md:p-8">
   <div class="mx-auto w-full max-w-2xl space-y-3">
    <p class="text-center font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Question</p>
    <div class="relative"><div class="relative">
     <button type="button" class="flip" data-state="default"><span class="flip__panel">
      <span class="flip__face flip__face--prompt"><span class="flip__scroll"><span class="flip__body" id="body">${text}</span></span></span>
      <span class="flip__face flip__face--answer" aria-hidden="true"><span class="flip__scroll"><span class="flip__body">Answer</span></span></span>
     </span></button>
    </div></div>
    <div class="flex min-h-[38px] items-center justify-center pt-2"><button class="reveal-hint"><span class="kbd">Space</span><span>reveal answer</span></button></div>
   </div>
  </div>
  <footer class="grade-band"><div class="mx-auto w-full max-w-2xl"><div class="grade-deck" data-armed="false">
   ${['Again|1m', 'Hard|6m', 'Good|10m', 'Easy|4d'].map((k, i) => `<button class="key" disabled style="--key-state:var(--state-due)"><span class="kk">${i + 1}</span><span class="kn">${k.split('|')[0]}</span><span class="ki">${k.split('|')[1]}</span></button>`).join('')}
  </div></div></footer>
 </div>
</div>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const rows = [];
for (const [w, h] of [[375, 667], [375, 812], [768, 1024], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark', isMobile: w < 768, hasTouch: w < 768 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3100/login', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (const [name, text] of Object.entries(TEXTS)) {
    await page.evaluate((html) => { document.body.innerHTML = html; }, shell(text));
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const body = document.getElementById('body');
      const cs = getComputedStyle(body);
      const scroll = body.closest('.flip__scroll');
      const flip = document.querySelector('.flip');
      const lh = parseFloat(cs.lineHeight);
      const lines = Math.round(body.getBoundingClientRect().height / lh);
      const words = body.textContent.length;
      return {
        fontPx: parseFloat(cs.fontSize).toFixed(1),
        family: cs.fontFamily.split(',')[0],
        bodyW: Math.round(body.getBoundingClientRect().width),
        charsPerLine: Math.round(words / Math.max(1, lines)),
        lines,
        cardH: Math.round(flip.getBoundingClientRect().height),
        visibleLines: Math.floor(scroll.clientHeight / lh),
        overflowPx: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
        pageScrollPx: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        keysTop: Math.round(document.querySelector('.grade-band').getBoundingClientRect().top),
      };
    });
    rows.push({ viewport: `${w}x${h}`, text: name, chars: text.length, ...m });
    if (name === 'pdf300') await page.screenshot({ path: `${process.argv[2]}/cardfit__${w}x${h}__pdf300.png` });
  }
  await ctx.close();
}
await browser.close();
console.table(rows);
```

### D.5 The spring probe (C.2)

Run inside a checkout with `node_modules` (it imports the app's own framer-motion):

```js
const fm = await import('framer-motion');
const md = await import('motion-dom').catch(() => null);
const spring = fm.spring ?? md?.spring;
console.log('spring export:', typeof spring, 'version', (await import('framer-motion/package.json', { with: { type: 'json' } })).default.version);
function settle(from, to, restDelta, restSpeed) {
  const gen = spring({ keyframes: [from, to], stiffness: 260, damping: 24, mass: 1, velocity: 0, restDelta, restSpeed });
  for (let t = 0; t < 5000; t += 1) { const s = gen.next(t); if (s.done) return t; }
  return -1;
}
// framer defaults: default restDelta 0.5 / restSpeed 2; granular (opacity, scale) 0.01 / 0.005
console.log('y 22→0 (default thresholds):', settle(22, 0), 'ms');
console.log('y 0→-18:', settle(0, -18), 'ms');
console.log('opacity 0→1 (granular 0.005 / 0.01):', settle(0, 1, 0.005, 0.01), 'ms');
console.log('opacity 1→0:', settle(1, 0, 0.005, 0.01), 'ms');
```

### D.6 The study card's accessibility tree (B.3)

```js
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage();
await p.setContent(`<div role="main"><button type="button" class="flip" data-state="default" aria-label="Showing the question. Press to reveal the answer."><span class="flip__panel"><span class="flip__face" aria-hidden="false"><span><span>What is the powerhouse of the cell?</span></span></span><span class="flip__face" aria-hidden="true"><span><span>Mitochondria</span></span></span></span></button></div>`);
console.log(await p.locator('body').ariaSnapshot());
const cdp = await p.context().newCDPSession(p);
const { nodes } = await cdp.send('Accessibility.getFullAXTree');
console.log(nodes.filter(n => !n.ignored).map(n => `${n.role?.value}: ${JSON.stringify(n.name?.value ?? '')}`).join('\n'));
await b.close();
```
