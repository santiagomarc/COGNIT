import { describe, expect, it } from 'vitest';
import { isMissingColumnError, isMissingDatabaseFunctionError, isMissingTableError } from './supabase-errors';

describe('isMissingTableError', () => {
  it('detects standard missing table messages', () => {
    expect(isMissingTableError('relation "card_mastery_state" does not exist', 'card_mastery_state')).toBe(true);
    expect(isMissingTableError('Could not find the table public.card_mastery_state in schema cache', 'card_mastery_state')).toBe(true);
  });

  it('returns false when table name does not match', () => {
    expect(isMissingTableError('relation "study_logs" does not exist', 'card_mastery_state')).toBe(false);
  });

  it('returns false for unrelated errors', () => {
    expect(isMissingTableError('permission denied for table card_mastery_state', 'card_mastery_state')).toBe(false);
  });
});

describe('isMissingColumnError', () => {
  it('detects standard missing column messages', () => {
    expect(isMissingColumnError('column include_in_history does not exist', 'include_in_history')).toBe(true);
    expect(isMissingColumnError('Could not find the column public.include_in_history in schema cache', 'include_in_history')).toBe(true);
  });

  it('returns false when column name does not match', () => {
    expect(isMissingColumnError('column other_column does not exist', 'include_in_history')).toBe(false);
  });

  it('returns false for unrelated errors', () => {
    expect(isMissingColumnError('invalid input syntax for type uuid', 'include_in_history')).toBe(false);
  });
});

describe('isMissingDatabaseFunctionError', () => {
  it('detects missing function messages for the requested function', () => {
    expect(
      isMissingDatabaseFunctionError('function get_due_cards_by_deck(uuid, timestamptz) does not exist', 'get_due_cards_by_deck')
    ).toBe(true);
  });

  it('returns false when function name does not match', () => {
    expect(
      isMissingDatabaseFunctionError('function get_other_thing() does not exist', 'get_due_cards_by_deck')
    ).toBe(false);
  });
});
