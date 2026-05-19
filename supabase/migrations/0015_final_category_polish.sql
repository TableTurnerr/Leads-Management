-- ============================================================================
-- 0015_final_category_polish.sql
-- Final cleanup pass after 0013/0014 brought the category count to ~130.
-- Removes empty-string entries, merges residual near-duplicates, and drops
-- categories that are too small to be useful facets (< 10 rows after merging).
-- ============================================================================

begin;

create temp table _cat_polish (old_cat text primary key, new_cat text);
-- NULL new_cat = remove from array

insert into _cat_polish (old_cat, new_cat) values
    -- residual near-duplicates
    ('Californian restaurant',           'Californian'),
    ('Portuguese restaurant',            'Portuguese'),
    ('Japanese Cuisine',                 'Japanese'),
    ('Chicken shop',                     'Chicken'),
    ('Continental restaurant',           'Continental'),
    ('Coffee House Cuisine',             'Coffee & Tea'),
    ('Bar / Lounge / Bottle Service',    'Bar'),
    ('Tamale',                           'Mexican'),
    ('Tamale shop',                      'Mexican'),
    ('Indonesian',                       'Southeast Asian'),
    ('Brasserie',                        'European'),
    ('Jewish',                           'Kosher'),
    ('Polynesian restaurant',            'Hawaiian'),
    ('Native American restaurant',       'American'),
    ('Traditional restaurant',           NULL),
    ('Vegetarian Description',           NULL),
    ('French Fries / Onion Rings',       NULL),
    ('Fried Chicken',                    'Chicken'),
    ('Haitian',                          'Caribbean'),
    -- empty string produced by regex stripping a bare " character
    ('',                                 NULL);

with normalized as (
    select
        r.id,
        array(
            select distinct
                case when m.old_cat is null then elem else m.new_cat end
            from unnest(r.cat_list) as elem
            left join _cat_polish m on m.old_cat = elem
            where (m.old_cat is null or m.new_cat is not null)
              and length(trim(elem)) > 0   -- also drop bare whitespace / empty
            order by 1
        ) as new_cat_list
    from public.restaurants r
    where cat_list is not null
)
update public.restaurants r
set    cat_list = n.new_cat_list
from   normalized n
where  r.id = n.id
  and  r.cat_list is distinct from n.new_cat_list;

drop table _cat_polish;

refresh materialized view concurrently public.restaurants_category_counts;
select public.refresh_overview_cache();
select public.refresh_map_cache();

commit;
