-- Aggregate due-card counts per deck to reduce dashboard payload size.

create or replace function public.get_due_cards_by_deck(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table (
  deck_id uuid,
  due_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    cards.deck_id,
    count(*)::bigint as due_count
  from public.cards
  join public.decks on decks.id = cards.deck_id
  where decks.user_id = p_user_id
    and cards.next_review_at <= p_now
  group by cards.deck_id
  order by due_count desc;
$$;

revoke all on function public.get_due_cards_by_deck(uuid, timestamptz) from public;
grant execute on function public.get_due_cards_by_deck(uuid, timestamptz) to authenticated;
grant execute on function public.get_due_cards_by_deck(uuid, timestamptz) to service_role;
