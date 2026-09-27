import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBackground } from './background';

afterEach(() => vi.restoreAllMocks());

function lastLine(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
}

describe('runBackground', () => {
  it('logs the outcome the work reports, with its task and fields', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await runBackground('lapse_mnemonic', async () => 'skipped', { cardId: 'c1' });
    expect(lastLine(info)).toMatchObject({ scope: 'background', task: 'lapse_mnemonic', background: 'skipped', cardId: 'c1' });
  });

  it('turns a throw into a failed outcome instead of an unhandled rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runBackground('repair_drill', async () => { throw new Error('boom'); })).resolves.toBeUndefined();
    expect(lastLine(warn)).toMatchObject({ scope: 'background', task: 'repair_drill', background: 'failed', message: 'boom' });
  });
});
