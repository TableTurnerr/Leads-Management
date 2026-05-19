-- ============================================================================
-- 0014_cleanup_artifacts_and_consolidate.sql
-- Two-pass cleanup:
--
-- PASS 1 — Regex: strip leading/trailing quote and bracket characters from
--   every cat_list element that starts with " or [.  Turns values like
--   '"Vegetarian"]', '["Take Out Restaurants"', '"European"' into their
--   clean inner text, which then matches the canonical names already in the
--   data or the mapping table in Pass 2.
--
-- PASS 2 — Mapping table: rename/remove the resulting cleaned values plus
--   additional consolidations missed by 0012/0013, then do a final count-
--   threshold purge: any category that appears on fewer than 10 restaurants
--   (after all renaming) is removed from every cat_list, because at that
--   volume it adds noise rather than useful facets.
-- ============================================================================

begin;

-- ============================================================
-- PASS 1: regex strip of leading [" and trailing "] artifacts
-- ============================================================
with cleaned as (
    select
        r.id,
        array(
            select distinct
                case
                    -- entry starts with " or [ → strip outer [, " chars from both ends
                    when elem ~ '^["[]'
                        then regexp_replace(
                                 regexp_replace(elem, '^["\[]+', ''),
                                 '["\]]+$', ''
                             )
                    else elem
                end
            from unnest(r.cat_list) as elem
            where elem is not null and length(trim(elem)) > 0
            order by 1
        ) as new_cat_list
    from public.restaurants r
    where cat_list is not null
      and exists (
          select 1 from unnest(r.cat_list) as elem where elem ~ '^["[]'
      )
)
update public.restaurants r
set    cat_list = c.new_cat_list
from   cleaned c
where  r.id = c.id
  and  r.cat_list is distinct from c.new_cat_list;

-- ============================================================
-- PASS 2: mapping table  (NULL new_cat = remove from array)
-- ============================================================
create temp table _cat_map2 (old_cat text primary key, new_cat text);

insert into _cat_map2 (old_cat, new_cat) values

    -- Results of Pass-1 cleaning that land on known bad values
    ('Take Out Restaurants',                     NULL),
    ('Restaurants',                              NULL),
    ('Family Style Restaurants',                 'Family Friendly'),
    ('Family Style',                             'Family Friendly'),
    ('Family Style Cuisine',                     'Family Friendly'),
    ('Asian Restaurants',                        'Asian'),
    ('Vegan Restaurants',                        'Vegan'),
    ('Thai Restaurants',                         'Thai'),
    ('Indian Restaurants',                       'Indian'),
    ('Chinese Restaurants',                      'Chinese'),
    ('Fast Food Restaurants',                    'Fast Food'),
    ('Latin American Restaurants',               'Latin American'),
    ('Sandwich Shop',                            'Sandwiches'),
    ('Sandwich Shops',                           'Sandwiches'),
    ('Sandwiches/Subs',                          'Sandwiches'),
    ('Coffee Shops',                             'Coffee & Tea'),
    ('Coffee & Espresso Restaurants',            'Coffee & Tea'),
    ('Coffee House',                             'Coffee & Tea'),
    ('Delicatessens',                            'Deli'),
    ('Delicatessen',                             'Deli'),
    ('Delis',                                    'Deli'),
    ('Bars',                                     'Bar'),
    ('Bar & Grills',                             'Bar & Grill'),
    ('Bar & Grille Cuisine',                     'Bar & Grill'),
    ('Barbecue',                                 'BBQ'),
    ('Barbecue Restaurants',                     'BBQ'),
    ('Barbecue Cuisine',                         'BBQ'),
    ('Steak Houses',                             'Steakhouse'),
    ('Steaks & Chops Cuisine',                   'Steakhouse'),
    ('Steakhouse',                               'Steakhouse'),
    ('Mediterranean Restaurants',                'Mediterranean'),
    ('Mediterranean Cuisine',                    'Mediterranean'),
    ('Middle Eastern Restaurants',               'Middle Eastern'),
    ('American Restaurants',                     'American'),
    ('American Cuisine',                         'American'),
    ('American Regional',                        'American'),
    ('American (New)',                            'New American'),
    ('Contemporary American',                    'American'),
    ('Mexican Restaurants',                      'Mexican'),
    ('Mexican Cuisine',                          'Mexican'),
    ('Italian Restaurants',                      'Italian'),
    ('Italian Cuisine',                          'Italian'),
    ('French Restaurants',                       'French'),
    ('French Cuisine',                           'French'),
    ('Modern French restaurant',                 'French'),
    ('Modern French',                            'French'),
    ('French American',                          'American'),
    ('Caribbean Restaurants',                    'Caribbean'),
    ('Seafood Restaurants',                      'Seafood'),
    ('Seafood Dishes',                           'Seafood'),
    ('Buffet Restaurants',                       'Buffet'),
    ('Korean Restaurants',                       'Korean'),
    ('Japanese Restaurants',                     'Japanese'),
    ('Greek Restaurants',                        'Greek'),
    ('Vietnamese Restaurants',                   'Vietnamese'),
    ('Vegan Cuisine',                            'Vegan'),
    ('Natural Foods',                            'Healthy'),
    ('Health Food',                              'Healthy'),
    ('Health',                                   'Healthy'),
    ('Gluten-free restaurant',                   'Gluten Free'),
    ('Gluten-Free Friendly',                     'Gluten Free'),
    ('Soul Food Restaurants',                    'Soul Food'),
    ('Soul',                                     'Soul Food'),
    ('Southern/Soul',                            'Soul Food'),
    ('Caf',                                      'Cafe'),
    ('cafe',                                     'Cafe'),
    ('Coffeehouse',                              'Coffee & Tea'),
    ('Coffeeshop / Diner',                       'Diner'),
    ('Dim Sum',                                  'Chinese'),
    ('Dumplings',                                'Chinese'),
    ('East African restaurant',                  'African'),
    ('West African',                             'African'),
    ('African Restaurants',                      'African'),
    ('Ethiopian/Eritrean',                       'Ethiopian'),
    ('Eritrean restaurant',                      'Ethiopian'),
    ('African: Ethiopian',                       'Ethiopian'),
    ('Haitian restaurant',                       'Haitian'),
    ('Israeli restaurant',                       'Middle Eastern'),
    ('Israeli',                                  'Middle Eastern'),
    ('Egyptian restaurant',                      'Middle Eastern'),
    ('Egyptian',                                 'Middle Eastern'),
    ('Syrian restaurant',                        'Middle Eastern'),
    ('Yemenite restaurant',                      'Middle Eastern'),
    ('Yemeni restaurant',                        'Middle Eastern'),
    ('Japanese: Other',                          'Japanese'),
    ('Japanese: Ramen',                          'Ramen'),
    ('Japanese BBQ',                             'Japanese'),
    ('Japanese curry restaurant',                'Japanese'),
    ('Japanese set items',                       'Japanese'),
    ('Japanese sweets',                          'Japanese'),
    ('Japanese Skewer food',                     'Japanese'),
    ('Sukiyaki and Shabu Shabu restaurant',      'Japanese'),
    ('Conveyor belt sushi restaurant',           'Sushi'),
    ('Chinese: Cantonese',                       'Chinese'),
    ('Chinese: Sichuan',                         'Chinese'),
    ('Chinese: Noodles &amp; Dumplings',         'Chinese'),
    ('Chinese: Other',                           'Chinese'),
    ('Hong Kong style fast food restaurant',     'Chinese'),
    ('Noodle Shop',                              'Noodles'),
    ('Asian fusion',                             'Asian Fusion'),
    ('Pan-Asian & Pacific Rim',                  'Asian Fusion'),
    ('Pan-Asian',                                'Asian'),
    ('Singaporean',                              'Southeast Asian'),
    ('Cambodian',                                'Southeast Asian'),
    ('Bangladeshi restaurant',                   'Southeast Asian'),
    ('Bangladeshi',                              'Southeast Asian'),
    ('Nepali',                                   'Indian'),
    ('Contemporary Indian',                      'Indian'),
    ('Dosa',                                     'Indian'),
    ('Pakistani Cuisine',                        'Pakistani'),
    ('Contemporary Louisiana restaurant',        'Cajun'),
    ('Creole & Cajun Restaurants',               'Cajun'),
    ('Cajun Cuisine',                            'Cajun'),
    ('Cajun & Creole',                           'Cajun'),
    ('Fusion / Eclectic',                        'International'),
    ('Eclectic / Int''l',                        'International'),
    ('Contemporary',                             NULL),
    ('Traditional',                              NULL),
    ('Western restaurant',                       'American'),
    ('British restaurant',                       'European'),
    ('British',                                  'European'),
    ('Swedish restaurant',                       'European'),
    ('Austrian restaurant',                      'European'),
    ('Hungarian restaurant',                     'European'),
    ('Cape Verdean restaurant',                  'African'),
    ('Nicaraguan restaurant',                    'Latin American'),
    ('Costa Rican restaurant',                   'Latin American'),
    ('Oaxacan restaurant',                       'Mexican'),
    ('Mexican torta restaurant',                 'Mexican'),
    ('Quesadillas',                              'Mexican'),
    ('Empanada',                                 'Latin American'),
    ('Arepa',                                    'Latin American'),
    ('Pan-Latin restaurant',                     'Latin American'),
    ('Asado',                                    'Latin American'),
    ('North Indian restaurant',                  'Indian'),
    ('South Indian restaurant',                  'Indian'),
    ('Modern Indian restaurant',                 'Indian'),
    ('South Asian restaurant',                   'Indian'),
    ('Mongolian Restaurants',                    'Mongolian BBQ'),
    ('Cheesesteak',                              'Sandwiches'),
    ('Cheesesteak restaurant',                   'Sandwiches'),
    ('Po boys restaurant',                       'Sandwiches'),
    ('Hoagie restaurant',                        'Sandwiches'),
    ('Crab house',                               'Seafood'),
    ('Oyster bar restaurant',                    'Seafood'),
    ('Fish and Chips',                           'Fish & Chips'),
    ('Fried Foods',                              'Fried Chicken'),
    ('Whole Wheat Crust',                        'Pizza'),
    ('Pizza & Pasta',                            'Pizza'),
    ('PIZZA',                                    'Pizza'),
    ('PIzza',                                    'Pizza'),
    ('Gastro Pub',                               'Pub'),
    ('Pub Food',                                 'Pub'),
    ('Modern American',                          'American'),
    ('Traditional American',                     'American'),
    ('burger',                                   'Burgers'),
    ('Hamburgers',                               'Burgers'),
    ('Soups',                                    'Soup'),
    ('Soup restaurant',                          'Soup'),
    ('Fruit',                                    NULL),
    ('Tea',                                      'Coffee & Tea'),
    ('Tea Room',                                 'Coffee & Tea'),
    ('Tea Rooms',                                'Coffee & Tea'),
    ('Tea &amp; Coffee',                         'Coffee & Tea'),
    ('Espresso bar',                             'Coffee & Tea'),
    ('Juices',                                   'Juice & Smoothies'),
    ('Frozen Yogurt',                            'Ice Cream & Frozen Yogurt'),
    ('Dessert restaurant',                       'Desserts'),
    ('Dessert',                                  'Desserts'),
    ('Donuts',                                   'Bakery'),
    ('Panini''s',                                'Sandwiches'),
    ('Panini''s & Wraps',                        'Sandwiches'),
    ('Oven Baked Subs',                          'Sandwiches'),
    ('Gyro',                                     'Middle Eastern'),
    ('Falafel restaurant',                       'Middle Eastern'),
    ('Kebab shop',                               'Middle Eastern'),
    ('Stir Fried',                               NULL),
    ('Fondue restaurant',                        'European'),
    ('Fondue',                                   'European'),
    ('Tapas',                                    'Tapas'),
    ('Brunch',                                   'Breakfast & Brunch'),
    ('Breakfast',                                'Breakfast & Brunch'),
    ('Breakfast Brunch & Lunch Restaurants',     'Breakfast & Brunch'),
    ('Southern',                                 'Southern'),

    -- Still-malformed or noise remaining after Pass 1
    ('Vitamins & Food Supplements',              NULL),
    ('Party & Event Planners',                   NULL),
    ('Wedding Planning & Consultants',           NULL),
    ('Wedding Reception Locations & Services',   NULL),
    ('Wedding Supplies & Services',              NULL),
    ('Halls Auditoriums & Ballrooms',            NULL),
    ('Gay & Lesbian Bars',                       NULL),
    ('Catering food and drink supplier',         NULL),
    ('Food Delivery Service',                    NULL),
    ('Delivery Service',                         NULL),
    ('Delivery service',                         NULL),
    ('Restaurant or cafe',                       NULL),
    ('Restaurant Delivery Service',              NULL),
    ('Veterans organization',                    NULL),
    ('Corporate office',                         NULL),
    ('Fraternal organization',                   NULL),
    ('Private university',                       NULL),
    ('Business center',                          NULL),
    ('Country club',                             NULL),
    ('Private golf course',                      NULL),
    ('Golf course',                              NULL),
    ('Racecourse',                               NULL),
    ('Pet boarding service',                     NULL),
    ('Personal chef service',                    NULL),
    ('Personal Chefs',                           NULL),
    ('Photography Schools',                      NULL),
    ('Meeting & Event Planning Services',        NULL),
    ('Park',                                     NULL),
    ('Marina',                                   NULL),
    ('Museum',                                   NULL),
    ('Movie theater',                            NULL),
    ('Historical landmark',                      NULL),
    ('RV park',                                  NULL),
    ('Piano bar',                                NULL),
    ('Karaoke bar',                              NULL),
    ('Winery',                                   NULL),
    ('Distillery',                               NULL),
    ('Tiki bar',                                 NULL),
    ('Live music venue',                         NULL),
    ('Internet Cafes',                           NULL),
    ('Lodge',                                    NULL),
    ('Lodging',                                  NULL),
    ('point_of_interest',                        NULL),
    ('Cocktail Lounges',                         'Cocktail Bar'),
    ('Beer & Ale',                               NULL),
    ('Cheese',                                   NULL),
    ('Butcher shop',                             NULL),
    ('Gourmet Deli Cuisine',                     'Deli'),
    ('Home Cooking Restaurants',                 'Comfort Food'),
    ('Family Fare',                              'Family Friendly'),
    ('Dinner',                                   NULL),
    ('Gourmet Shops',                            NULL),
    ('Food Products',                            NULL),
    ('Food producer',                            NULL),
    ('Flowers',                                  NULL),
    ('Candy',                                    NULL),
    ('Specialties',                              NULL),
    ('Box Lunches',                              NULL),
    ('Carnicera',                                NULL),
    ('whatever',                                 NULL),
    ('Rachel',                                   NULL),
    ('Bartending Service',                       NULL),
    ('Soft drinks shop',                         NULL),
    ('Café Description',                         NULL),
    ('Cafe Description',                         NULL),
    ('Rice restaurant',                          'Asian'),
    ('Wok restaurant',                           'Asian'),
    ('Uzbeki restaurant',                        'Asian'),
    ('Thai Cuisine',                             'Thai'),
    ('Northeastern Thai',                        'Thai'),
    ('Northern Thai',                            'Thai'),
    ('Pies',                                     'Desserts'),
    ('Pie shop',                                 'Desserts'),
    ('Paleo',                                    'Healthy'),
    ('Sports Bars',                              'Sports Bar'),
    ('Brew Pub',                                 'Pub'),
    ('Teppanyaki',                               'Japanese'),
    ('Tempura',                                  'Japanese'),
    ('Curry',                                    'Indian');

with normalized as (
    select
        r.id,
        array(
            select distinct
                case when m.old_cat is null then elem else m.new_cat end
            from unnest(r.cat_list) as elem
            left join _cat_map2 m on m.old_cat = elem
            where m.old_cat is null or m.new_cat is not null
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

drop table _cat_map2;

-- ============================================================
-- PASS 3: threshold purge — remove categories that appear on
-- fewer than 10 restaurants. Compute live counts to avoid
-- relying on the (pre-update) materialized view.
-- ============================================================
with live_counts as (
    select elem as cat, count(*) as cnt
    from public.restaurants, unnest(cat_list) as elem
    where cat_list is not null
    group by elem
),
keep_cats as (
    select cat from live_counts where cnt >= 10
)
update public.restaurants r
set cat_list = array(
    select elem
    from unnest(r.cat_list) as elem
    where elem in (select cat from keep_cats)
)
where cat_list is not null
  and exists (
      select 1 from unnest(r.cat_list) as elem
      where elem not in (select cat from keep_cats)
  );

-- ============================================================
-- Refresh caches
-- ============================================================
refresh materialized view concurrently public.restaurants_category_counts;
select public.refresh_overview_cache();
select public.refresh_map_cache();

commit;
