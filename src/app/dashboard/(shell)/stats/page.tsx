import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Info } from 'lucide-react';

import { LoadForecast } from '@/components/ui/shared/analytics/LoadForecast';
import { RetentionTrend } from '@/components/ui/shared/analytics/RetentionTrend';
import { MemoryStatus } from '@/components/ui/shared/analytics/MemoryStatus';
import { FlashcardProgress } from '@/components/ui/shared/analytics/FlashcardProgress';
import { TopicHeatmap } from '@/components/ui/shared/analytics/TopicHeatmap';

import {
  intervalBands,
  loadSeries,
  parseAnalyticsSnapshot,
  recentRetention,
  retrievabilityHistogram,
  type AnalyticsSnapshot,
} from '@/lib/analytics';

import { logger } from '@/lib/logger';

import {
  getRequestClient,
  getRequestNow,
  getSessionUser,
} from '@/lib/supabase/session';

const WINDOW_DAYS = 90;

type SnapshotMetric = {
  label: string;
  value: string | number;
  description: string;
  accent?: boolean;
};

type ActivityPoint = {
  date: string;
  count: number;
};

function formatReviewTime(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;

  if (hours === 0) return `${remaining}m`;
  if (remaining === 0) return `${hours}h`;

  return `${hours}h ${remaining}m`;
}

/* =========================================
   PAGE HEADER
   ========================================= */

function StatisticsHeader() {
  return (
    <header className="relative isolate overflow-hidden pb-3 pt-1">
      {/* Soft constellation-inspired curves */}
      <svg
        viewBox="0 0 540 112"
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute -right-1 bottom-0 -z-10 hidden h-full w-[42%] opacity-70 md:block"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="header-constellation-line"
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            <stop
              offset="0%"
              stopColor="var(--state-due)"
              stopOpacity=".06"
            />

            <stop
              offset="45%"
              stopColor="var(--state-due)"
              stopOpacity=".32"
            />

            <stop
              offset="100%"
              stopColor="var(--state-due)"
              stopOpacity=".18"
            />
          </linearGradient>

          <radialGradient id="header-star-glow">
            <stop
              offset="0%"
              stopColor="var(--state-due)"
              stopOpacity=".15"
            />

            <stop
              offset="100%"
              stopColor="var(--state-due)"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>

        {/* Scattered background stars */}
        <g
          fill="var(--state-due)"
          opacity=".19"
        >
          <circle cx={34} cy={24} r={0.9} />
          <circle cx={65} cy={94} r={1} />
          <circle cx={106} cy={12} r={0.8} />
          <circle cx={146} cy={85} r={0.8} />
          <circle cx={202} cy={15} r={0.9} />
          <circle cx={244} cy={98} r={1} />
          <circle cx={286} cy={25} r={0.7} />
          <circle cx={338} cy={92} r={0.9} />
          <circle cx={378} cy={12} r={0.8} />
          <circle cx={426} cy={99} r={0.7} />
          <circle cx={478} cy={15} r={0.9} />
          <circle cx={526} cy={83} r={0.8} />
        </g>

        {/* Ursa Major-inspired constellation */}
        <g
          fill="none"
          stroke="url(#header-constellation-line)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Connected handle */}
          <path d="M90 48 L150 26 L216 42 L282 72" />

          {/* Main constellation body */}
          <path d="M282 72 L372 56 L410 19 L322 12 Z" />

          {/* Subtle neighboring constellation */}
          <path
            d="M450 70 L490 91 L526 54"
            opacity=".45"
          />
        </g>

        {/* Soft star glows */}
        <g fill="url(#header-star-glow)">
          <circle cx={150} cy={26} r={9} />
          <circle cx={216} cy={42} r={8} />
          <circle cx={282} cy={72} r={10} />
          <circle cx={372} cy={56} r={8} />
          <circle cx={410} cy={19} r={9} />
        </g>

        {/* Main stars */}
        <g fill="var(--state-due)">
          <circle cx={90} cy={48} r={1.8} opacity=".35" />
          <circle cx={150} cy={26} r={2.4} opacity=".55" />
          <circle cx={216} cy={42} r={2.2} opacity=".65" />
          <circle cx={282} cy={72} r={2.8} opacity=".85" />
          <circle cx={372} cy={56} r={2.4} opacity=".65" />
          <circle cx={410} cy={19} r={2.7} opacity=".75" />
          <circle cx={322} cy={12} r={2} opacity=".45" />

          <circle cx={450} cy={70} r={1.4} opacity=".25" />
          <circle cx={490} cy={91} r={1.7} opacity=".3" />
          <circle cx={526} cy={54} r={1.5} opacity=".25" />
        </g>

        {/* Delicate star highlights */}
        <g
          stroke="var(--state-due)"
          strokeWidth=".8"
          strokeLinecap="round"
          opacity=".35"
        >
          <path d="M282 66 V78 M276 72 H288" />
          <path d="M410 14 V24 M405 19 H415" />
        </g>
      </svg>

      <div className="max-w-[560px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
          Learning Analytics
        </p>

        <h1 className="mt-1 font-serif type-display-md leading-[1.02] tracking-[-0.02em] text-ink sm:type-display">
          Statistics
        </h1>

        <p className="mt-1.5 text-sm leading-snug text-ink-dim">
          Track your learning progress and
          discover what to study next.
        </p>
      </div>
    </header>
  );
}

/* =========================================
   LEARNING SNAPSHOT
   ========================================= */

function LearningSnapshot({
  metrics,
}: {
  metrics: SnapshotMetric[];
}) {
  return (
    <section
      className="surface spec min-w-0"
      aria-labelledby="snapshot-heading"
    >
      <div className="grid grid-cols-2 items-stretch @min-[900px]:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))]">

        {/* Introduction panel */}
        <div className="relative isolate col-span-2 flex min-w-0 flex-col justify-center overflow-hidden rounded-[var(--radius-lg)] bg-[#B7410E]/[0.045] py-3 pl-[38%] pr-3 @min-[900px]:col-span-1">

          {/* Decorative connected-knowledge illustration */}
          <svg
            viewBox="0 0 150 145"
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none absolute inset-y-0 left-1 -z-10 h-full w-[34%]"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="snapshot-star-glow">
                <stop
                  offset="0%"
                  stopColor="var(--state-due)"
                  stopOpacity=".18"
                />

                <stop
                  offset="100%"
                  stopColor="var(--state-due)"
                  stopOpacity="0"
                />
              </radialGradient>

              <linearGradient
                id="snapshot-constellation-line"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stopColor="var(--state-due)"
                  stopOpacity=".22"
                />

                <stop
                  offset="50%"
                  stopColor="var(--state-due)"
                  stopOpacity=".45"
                />

                <stop
                  offset="100%"
                  stopColor="var(--state-due)"
                  stopOpacity=".22"
                />
              </linearGradient>
            </defs>

            {/* Small surrounding stars */}
            <g
              fill="var(--state-due)"
              opacity=".22"
            >
              <circle cx={11} cy={15} r={0.8} />
              <circle cx={133} cy={14} r={0.9} />
              <circle cx={22} cy={64} r={0.7} />
              <circle cx={142} cy={79} r={0.8} />
              <circle cx={10} cy={115} r={0.9} />
              <circle cx={129} cy={132} r={0.7} />
              <circle cx={43} cy={8} r={0.6} />
              <circle cx={104} cy={105} r={0.7} />
              <circle cx={16} cy={89} r={0.6} />
              <circle cx={93} cy={19} r={0.8} />
              <circle cx={123} cy={52} r={0.7} />
            </g>

            {/* Orion-inspired constellation structure */}
            <g
              fill="none"
              stroke="url(#snapshot-constellation-line)"
              strokeWidth=".9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Upper body and central belt */}
              <path d="M43 25 L65 62 L79 68 L93 75 L111 36 L43 25" />

              {/* Lower body */}
              <path d="M65 62 L39 119 L107 127 L93 75" />

              {/* Outer branches */}
              <path d="M43 25 L28 8" />
              <path d="M111 36 L133 26" />
            </g>

            {/* Soft glow around the main stars */}
            <g fill="url(#snapshot-star-glow)">
              <circle cx={43} cy={25} r={8} />
              <circle cx={111} cy={36} r={7} />
              <circle cx={65} cy={62} r={6} />
              <circle cx={79} cy={68} r={8} />
              <circle cx={93} cy={75} r={6} />
              <circle cx={39} cy={119} r={7} />
              <circle cx={107} cy={127} r={8} />
            </g>

            {/* Main connected stars */}
            <g fill="var(--state-due)">
              <circle cx={43} cy={25} r={2.6} opacity=".85" />
              <circle cx={111} cy={36} r={2.2} opacity=".7" />
              <circle cx={65} cy={62} r={2} opacity=".75" />
              <circle cx={79} cy={68} r={2.5} opacity=".95" />
              <circle cx={93} cy={75} r={2} opacity=".75" />
              <circle cx={39} cy={119} r={2.2} opacity=".75" />
              <circle cx={107} cy={127} r={2.7} opacity=".85" />
              <circle cx={28} cy={8} r={1.4} opacity=".4" />
              <circle cx={133} cy={26} r={1.4} opacity=".4" />
            </g>

            {/* Subtle four-point star highlights */}
            <g
              stroke="var(--state-due)"
              strokeWidth=".7"
              strokeLinecap="round"
              opacity=".45"
            >
              <path d="M43 20 V30 M38 25 H48" />
              <path d="M107 122 V132 M102 127 H112" />
            </g>
          </svg>

          <div className="relative">
            <h2
              id="snapshot-heading"
              className="font-sans text-base font-semibold leading-snug text-ink"
            >
              Your Learning
              <span className="block">Snapshot</span>
            </h2>

            <p className="mt-1.5 text-[11px] leading-snug text-ink-dim">
              A quick look at your current
              study performance.
            </p>
          </div>
        </div>

        {/* Four metrics */}
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={[
              'relative flex min-w-0 flex-col justify-center px-4 py-3',
              index % 2 === 1
                ? 'border-l border-border'
                : '',
              '@min-[900px]:border-l-0',
              '@min-[900px]:px-5',
            ].join(' ')}
          >
            {/* Short vertical separators */}
            <span
              className="absolute bottom-[22%] left-0 top-[22%] hidden w-px bg-[var(--border-strong)] @min-[900px]:block"
              aria-hidden="true"
            />

            <p
              className="font-mono text-[30px] font-semibold leading-none tracking-[-0.04em] tnum"
              style={{
                color: metric.accent
                  ? 'var(--state-due)'
                  : 'var(--ink)',
              }}
            >
              {metric.value}
            </p>

            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-xs font-medium leading-snug text-ink">
                {metric.label}
              </span>

              {/* Information tooltip */}
              <span className="group relative inline-flex shrink-0">
                <span
                  tabIndex={0}
                  aria-label={metric.description}
                  title={metric.description}
                  className="inline-flex cursor-help rounded-full text-ink-dimmer"
                >
                  <Info
                    className="size-3"
                    aria-hidden="true"
                  />
                </span>

                <span
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-[170px] -translate-x-1/2 rounded-[8px] border border-border bg-surface px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-ink shadow-sm group-hover:block group-focus-within:block"
                  aria-hidden="true"
                >
                  {metric.description}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================
   COMPACT STUDY ACTIVITY HEATMAP

   Statistics-specific presentation.
   Uses the existing Cognit heatmap colors.
   ========================================= */

function activityIntensity(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;

  return 4;
}

function CompactActivityHeatmap({
  activity,
  anchorDate,
}: {
  activity: ActivityPoint[];
  anchorDate: string;
}) {
  const end = new Date(
    `${anchorDate}T00:00:00Z`
  );

  const start = new Date(end);

  start.setUTCDate(
    start.getUTCDate() - (WINDOW_DAYS - 1)
  );

  const actualStart =
    start.toISOString().slice(0, 10);

  // Align the first column to Sunday.
  while (start.getUTCDay() !== 0) {
    start.setUTCDate(start.getUTCDate() - 1);
  }

  const countByDate = new Map(
    activity.map((day) => [
      day.date,
      day.count,
    ])
  );

  const days: {
    date: string;
    count: number;
    outside: boolean;
  }[] = [];

  const cursor = new Date(start);

  while (cursor <= end) {
    const date =
      cursor.toISOString().slice(0, 10);

    days.push({
      date,
      count: countByDate.get(date) ?? 0,
      outside: date < actualStart,
    });

    cursor.setUTCDate(
      cursor.getUTCDate() + 1
    );
  }

  const weeks: (typeof days)[] = [];

  for (
    let index = 0;
    index < days.length;
    index += 7
  ) {
    weeks.push(
      days.slice(index, index + 7)
    );
  }

  const monthFormat =
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });

  const monthLabels = weeks.map(
    (week, index) => {
      const first = week[0];

      if (!first) return null;

      const date = new Date(
        `${first.date}T00:00:00Z`
      );

      const previous =
        weeks[index - 1]?.[0];

      if (index === 0 || !previous) {
        return monthFormat.format(
          new Date(`${actualStart}T00:00:00Z`)
        );
      }

      const previousDate = new Date(
        `${previous.date}T00:00:00Z`
      );

      return date.getUTCMonth() !==
        previousDate.getUTCMonth()
        ? monthFormat.format(date)
        : null;
    }
  );

  const gridStyle = {
    gridTemplateColumns:
      `repeat(${weeks.length}, minmax(0, 1fr))`,
  };

  return (
    <div className="w-full min-w-0">

      {/* Month labels */}
      <div className="mb-1 flex">
        <div className="w-6 shrink-0" />

        <div
          className="grid min-w-0 flex-1 gap-[2px]"
          style={gridStyle}
        >
          {monthLabels.map((label, index) => (
            <span
              key={index}
              className="text-[9px] leading-none text-ink-dim"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Weekday labels and activity cells */}
      <div className="flex gap-1">
        <div className="grid w-5 shrink-0 grid-rows-7 gap-[2px]">
          {['', 'Mon', '', 'Wed', '', 'Fri', ''].map(
            (label, index) => (
              <span
                key={index}
                className="flex items-center text-[9px] leading-none text-ink-dimmer"
              >
                {label}
              </span>
            )
          )}
        </div>

        <div
          className="grid min-w-0 flex-1 gap-[2px]"
          style={gridStyle}
        >
          {weeks.map((week) => (
            <div
              key={week[0].date}
              className="flex flex-col gap-[2px]"
            >
              {week.map((day) => (
                <div
                  key={day.date}
                  title={
                    day.outside
                      ? undefined
                      : `${day.date}: ${day.count} review events`
                  }
                  aria-label={
                    day.outside
                      ? undefined
                      : `${day.date}: ${day.count} review events`
                  }
                  aria-hidden={
                    day.outside ? true : undefined
                  }
                  className="aspect-square w-full rounded-[2px]"
                  style={{
                    backgroundColor: day.outside
                      ? 'transparent'
                      : `var(--heat-ramp-${activityIntensity(day.count)})`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Compact activity legend */}
      <div className="mt-1.5 flex items-center justify-end gap-1">
        <span className="text-[9px] text-ink-dimmer">
          Less
        </span>

        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="size-[7px] rounded-[1px]"
            style={{
              backgroundColor: `var(--heat-ramp-${level})`,
            }}
            aria-hidden="true"
          />
        ))}

        <span className="text-[9px] text-ink-dimmer">
          More
        </span>
      </div>
    </div>
  );
}

/* =========================================
   STUDY ACTIVITY PANEL
   ========================================= */

function StudyActivity({
  reviews,
  minutes,
  effort,
  todayIso,
}: {
  reviews: number;
  minutes: number;
  effort: ActivityPoint[];
  todayIso: string;
}) {
  return (
    <section
      className="surface spec min-w-0 px-4 py-3"
      aria-labelledby="activity-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2
          id="activity-heading"
          className="type-h3 font-semibold leading-tight text-ink"
        >
          Study Activity
        </h2>

        <span className="rounded-[7px] border border-border px-2 py-0.5 text-[10px] text-ink-dim">
          Past 90 days
        </span>
      </div>

      <p className="mt-1 text-xs leading-snug text-ink-dim">
        See how consistently you have been studying.
      </p>

      {/* Horizontal statistics and heatmap */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex w-[108px] shrink-0 flex-col gap-3">
          <div>
            <p className="font-mono text-[22px] font-semibold leading-none tnum text-ink">
              {reviews}
            </p>

            <p className="mt-0.5 text-[10px] leading-snug text-ink-dim">
              Reviews completed
            </p>
          </div>

          <div>
            <p className="font-mono text-[22px] font-semibold leading-none tnum text-ink">
              {formatReviewTime(minutes)}
            </p>

            <p className="mt-0.5 text-[10px] leading-snug text-ink-dim">
              Recorded review time
            </p>
          </div>
        </div>

        <div className="min-w-[145px] max-w-[220px] flex-1">
          <CompactActivityHeatmap
            activity={effort}
            anchorDate={todayIso}
          />
        </div>
      </div>
    </section>
  );
}

/* =========================================
   MAIN STATISTICS PAGE
   ========================================= */

export default async function StatsPage() {
  const [supabase, user] = await Promise.all([
    getRequestClient(),
    getSessionUser(),
  ]);

  if (!user) {
    redirect('/login');
  }

  const now = getRequestNow();

  const { data, error } = await supabase.rpc(
    'get_analytics_snapshot',
    {
      p_now: now.toISOString(),
      p_days: WINDOW_DAYS,
    }
  );

  let snapshot: AnalyticsSnapshot | null = null;

  if (error) {
    logger.error(
      'stats',
      'get_analytics_snapshot rpc failed',
      { message: error.message }
    );
  } else {
    snapshot = parseAnalyticsSnapshot(data);

    if (!snapshot) {
      logger.error(
        'stats',
        'get_analytics_snapshot returned an unexpected shape'
      );
    }
  }

  if (!snapshot) {
    return (
      <div className="container mx-auto flex flex-col gap-3 px-4 py-4 md:px-8">
        <StatisticsHeader />

        <section className="surface p-4">
          <h2 className="type-h3 font-semibold text-ink">
            Statistics unavailable
          </h2>

          <p className="mt-2 text-sm text-ink-dim">
            Your statistics could not be loaded.
            Try refreshing the page. Your reviews
            are still being recorded.
          </p>
        </section>
      </div>
    );
  }

  const hasHistory =
    snapshot.totals.reviews_in_window > 0 ||
    snapshot.totals.review_state > 0;

  const recentRate = recentRetention(
    snapshot.retention_weekly,
    4
  );

  const retentionPct =
    recentRate === null
      ? null
      : Math.round(recentRate * 100);

  const recallNow =
    snapshot.totals.mean_r_now === null
      ? null
      : Math.round(
          snapshot.totals.mean_r_now * 100
        );

  const bars = retrievabilityHistogram(snapshot);

  const load = loadSeries(
    snapshot.load_30d,
    now
  );

  const bands = intervalBands(snapshot);

  const effort = snapshot.effort.map((day) => ({
    date: day.day,
    count: day.reviews,
  }));

  const minutes = snapshot.effort.reduce(
    (sum, day) => sum + day.minutes,
    0
  );

  const todayIso =
    now.toISOString().slice(0, 10);

  const atRiskHref =
    snapshot.totals.at_risk_deck_id
      ? `/dashboard/${snapshot.totals.at_risk_deck_id}/study?scope=due`
      : null;

  const metrics: SnapshotMetric[] = [
    {
      label: 'Review success rate',
      value:
        retentionPct === null
          ? '—'
          : `${retentionPct}%`,
      description:
        'Percentage of eligible reviews receiving a passing grade across up to four recent active weeks.',
    },
    {
      label: 'Estimated recall',
      value:
        recallNow === null
          ? '—'
          : `${recallNow}%`,
      description:
        'Estimated probability of remembering previously reviewed flashcards.',
    },
    {
      label: 'Cards at risk',
      value: snapshot.totals.at_risk_now,
      description:
        'Reviewed flashcards with estimated recall below 80%.',
      accent: snapshot.totals.at_risk_now > 0,
    },
    {
      label: 'Total flashcards',
      value: snapshot.totals.cards,
      description:
        'Total flashcards across all your decks.',
    },
  ];

  return (
    <div className="container mx-auto min-w-0 px-4 py-4 md:px-8">

      {/* Container-based responsive layout */}
      <div className="@container flex min-w-0 flex-col gap-3">

        {/* Header */}
        <StatisticsHeader />

        {/* Unified learning overview */}
        <LearningSnapshot metrics={metrics} />

        {!hasHistory ? (
          <>
            <section className="surface p-4">
              <h2 className="type-h3 font-semibold text-ink">
                Start building your learning history
              </h2>

              <p className="mt-2 max-w-xl text-sm text-ink-dim">
                Review your flashcards or take a quiz
                to begin tracking your learning
                performance and study activity.
              </p>

              <Link
                href="/dashboard"
                className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4"
              >
                Back to your decks
              </Link>
            </section>

            <FlashcardProgress bands={bands} />
          </>
        ) : (
          <>
            {/* ROW 1: Unequal graph widths */}
            <div className="grid min-w-0 items-stretch gap-3 @min-[800px]:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">

              <section
                className="surface spec min-w-0 px-4 py-3"
                aria-labelledby="trend-heading"
              >
                <h2
                  id="trend-heading"
                  className="type-h3 font-semibold leading-tight text-ink"
                >
                  Learning Performance
                </h2>

                <p className="mt-1 text-xs leading-snug text-ink-dim">
                  Track your review success rate over time.
                </p>

                <RetentionTrend
                  weeks={snapshot.retention_weekly}
                />
              </section>

              <section
                className="surface spec min-w-0 px-4 py-3"
                aria-labelledby="load-heading"
              >
                <LoadForecast days={load} />
              </section>
            </div>

            {/* ROW 2: Three compact rectangular panels */}
            <div className="grid min-w-0 items-stretch gap-3 @min-[700px]:grid-cols-2 @min-[1100px]:grid-cols-[minmax(0,39fr)_minmax(0,34fr)_minmax(0,27fr)]">

              <MemoryStatus
                bars={bars}
                recommendedHref={atRiskHref}
              />

              <StudyActivity
                reviews={snapshot.totals.reviews_in_window}
                minutes={minutes}
                effort={effort}
                todayIso={todayIso}
              />

              <div className="min-w-0 @min-[700px]:col-span-2 @min-[1100px]:col-span-1 [&>section]:h-full">
                <FlashcardProgress bands={bands} />
              </div>
            </div>

            {/* ROW 3: Existing Topic Mastery */}
            <TopicHeatmap
              topics={snapshot.topic_mastery}
            />

            <p className="text-[10px] text-ink-dimmer">
              Analytics dates use UTC. Gaps in the
              performance chart indicate weeks without
              eligible review results.
            </p>
          </>
        )}
      </div>
    </div>
  );
}