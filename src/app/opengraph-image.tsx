import { ImageResponse } from 'next/og';
import { OG_PALETTE } from '@/lib/og-palette';

export const alt = 'Cognit: flashcards from your own material, scheduled by SM-2';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The link unfurl, generated at build and served same-origin, so the CSP is unaffected. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 96,
          background: OG_PALETTE.bg,
          color: OG_PALETTE.ink,
        }}
      >
        <div style={{ fontSize: 112, letterSpacing: '-0.03em' }}>Cognit</div>
        <div style={{ marginTop: 28, fontSize: 40, color: OG_PALETTE.inkDim }}>
          Flashcards from your own material, scheduled by SM-2.
        </div>
      </div>
    ),
    size,
  );
}
