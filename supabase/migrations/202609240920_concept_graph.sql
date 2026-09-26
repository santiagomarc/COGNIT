-- supabase/migrations/202609240920_concept_graph.sql
create or replace function public.get_concept_graph(
  p_deck_id uuid,
  p_max_nodes integer default 80
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  drills as (
    select d.id, d.required_links
      from public.synthesis_drills d
     where d.deck_id = p_deck_id
       and d.user_id = (select uid from me)
       and d.status = 'active'
  ),
  latest as (
    select distinct on (a.drill_id) a.drill_id, a.coverage
      from public.synthesis_attempts a
      join drills on drills.id = a.drill_id
     where a.user_id = (select uid from me)
     order by a.drill_id, a.created_at desc
  ),
  links as (
    select dr.id as drill_id,
           link ->> 'id' as link_id,
           array(select jsonb_array_elements_text(link -> 'card_ids')) as card_ids
      from drills dr
      cross join lateral jsonb_array_elements(dr.required_links) as link
  ),
  statuses as (
    select l.card_ids,
           coalesce(hit.entry ->> 'status', 'unseen') as status
      from links l
      left join latest lt on lt.drill_id = l.drill_id
      left join lateral (
        select entry
          from jsonb_array_elements(coalesce(lt.coverage, '[]'::jsonb)) as entry
         where entry ->> 'link_id' = l.link_id
         limit 1
      ) hit on true
  ),
  pairs as (
    select least(a.id, b.id) as source,
           greatest(a.id, b.id) as target,
           s.status
      from statuses s
      cross join lateral unnest(s.card_ids) as a(id)
      cross join lateral unnest(s.card_ids) as b(id)
     where a.id < b.id
  ),
  edges as (
    select source,
           target,
           count(*) as links,
           count(*) filter (where status = 'covered') as covered,
           count(*) filter (where status = 'partial') as partial,
           count(*) filter (where status = 'missing') as missing
      from pairs
     group by source, target
  ),
  weights as (
    select id, sum(links) as weight
      from (
        select source as id, links from edges
        union all
        select target as id, links from edges
      ) ends
     group by id
  ),
  kept as (
    select id
      from weights
     order by weight desc, id
     limit greatest(1, least(coalesce(p_max_nodes, 80), 150))
  ),
  contradicted as (
    select hit.card_id::text as id, count(*) as n
      from public.synthesis_attempts a
      cross join lateral unnest(a.contradicted_card_ids) as hit(card_id)
     where a.deck_id = p_deck_id
       and a.user_id = (select uid from me)
       and a.created_at > now() - interval '30 days'
     group by hit.card_id
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'term', c.front,          -- `front` is the term/answer (design system §7.6)
               'state', c.state,
               'contradicted', coalesce(x.n, 0)
             ) order by c.front)
        from public.cards c
        join kept k on k.id = c.id::text
        left join contradicted x on x.id = c.id::text
       where c.deck_id = p_deck_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'source', e.source,
               'target', e.target,
               'links', e.links,
               'covered', e.covered,
               'partial', e.partial,
               'missing', e.missing
             ) order by e.source, e.target)
        from edges e
       where e.source in (select id from kept)
         and e.target in (select id from kept)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_concept_graph(uuid, integer) from public;
grant execute on function public.get_concept_graph(uuid, integer) to authenticated;
