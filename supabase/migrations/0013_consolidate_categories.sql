-- ============================================================================
-- 0013_consolidate_categories.sql
-- Aggressive consolidation pass: reduces ~1800 distinct cat_list values down
-- to a manageable set by:
--   1. Merging pizza sub-types, Chinese sub-cuisines, Indian variants, etc.
--   2. Removing service/attribute tags that are not cuisine types (Takeout,
--      Delivery, Alcohol, Exclusive to Eats, etc.)
--   3. Removing junk/malformed entries.
--   4. Collapsing small regional variants into their parent cuisine
--      (e.g. Ecuadorian restaurant → Latin American, Malaysian → Southeast Asian).
--
-- NULL in new_cat means "remove from the array entirely". The CTE filters
-- those out after the left join.
-- ============================================================================

begin;

create temp table _cat_map (old_cat text primary key, new_cat text);
-- NULL new_cat = remove this element from every cat_list that contains it

insert into _cat_map (old_cat, new_cat) values

    -- ------------------------------------------------------------------ --
    -- Pizza                                                               --
    -- ------------------------------------------------------------------ --
    ('Pizza restaurant',                         'Pizza'),
    ('Pizza By The Slice',                       'Pizza'),
    ('Pizza takeaway',                           'Pizza'),
    ('Pizza delivery',                           'Pizza'),
    ('Brick Oven Pizza',                         'Pizza'),
    ('Neapolitan Style Pizza',                   'Pizza'),
    ('New York Style Pizza',                     'Pizza'),
    ('Sicilian Pizza',                           'Pizza'),
    ('White Pizza',                              'Pizza'),
    ('Deep Skillet / Pan Pizza',                 'Pizza'),
    ('Tomato Pie',                               'Pizza'),
    ('pizza',                                    'Pizza'),
    ('Pizzeria',                                 'Pizza'),
    ('Pizza Cuisine',                            'Pizza'),
    ('"""Pizza"""',                              'Pizza'),
    ('Stone Baked Pizza',                        'Pizza'),
    ('Calzones',                                 'Pizza'),
    ('Stromboli',                                'Pizza'),
    ('Homemade Dough',                           'Pizza'),
    ('Pizza Pie',                                'Pizza'),

    -- ------------------------------------------------------------------ --
    -- Chicken / Wings                                                     --
    -- ------------------------------------------------------------------ --
    ('Fried Chicken',                            'Chicken'),
    ('Fried chicken takeaway',                   'Chicken'),
    ('Chicken wings restaurant',                 'Wings'),
    ('Chicken Strips',                           'Chicken'),
    ('Chicken Restaurants',                      'Chicken'),

    -- ------------------------------------------------------------------ --
    -- Hot Dogs                                                            --
    -- ------------------------------------------------------------------ --
    ('Hot dog restaurant',                       'Hot Dogs'),
    ('Hot Dog',                                  'Hot Dogs'),
    ('Hot dog stand',                            'Hot Dogs'),
    ('Hamburgers & Hot Dogs',                    'Hot Dogs'),
    ('Burgers / Hot Dogs',                       'Burgers'),

    -- ------------------------------------------------------------------ --
    -- Sandwiches                                                          --
    -- ------------------------------------------------------------------ --
    ('Hoagies / Grinders / Subs / Gyros',        'Sandwiches'),
    ('Wraps',                                    'Sandwiches'),
    ('Salad / Sandwiches',                       'Sandwiches'),

    -- ------------------------------------------------------------------ --
    -- Steakhouse                                                          --
    -- ------------------------------------------------------------------ --
    ('Steak',                                    'Steakhouse'),
    ('Steaks & Chops Cuisine',                   'Steakhouse'),
    ('Japanese steakhouse',                      'Steakhouse'),
    ('Chophouse restaurant',                     'Steakhouse'),

    -- ------------------------------------------------------------------ --
    -- Noodles / Pho                                                       --
    -- ------------------------------------------------------------------ --
    ('Noodle shop',                              'Noodles'),
    ('Chinese noodle restaurant',                'Noodles'),
    ('Beef Noodles',                             'Noodles'),
    ('Pho restaurant',                           'Pho'),

    -- ------------------------------------------------------------------ --
    -- Juice & Smoothies                                                   --
    -- ------------------------------------------------------------------ --
    ('Juice and Smoothies',                      'Juice & Smoothies'),
    ('Juice shop',                               'Juice & Smoothies'),
    ('Smoothies/Juice Bar',                      'Juice & Smoothies'),
    ('Smoothies',                                'Juice & Smoothies'),
    ('Juice &amp; Smoothies',                    'Juice & Smoothies'),

    -- ------------------------------------------------------------------ --
    -- Coffee & Tea                                                        --
    -- ------------------------------------------------------------------ --
    ('Coffee Shop',                              'Coffee & Tea'),
    ('Coffee',                                   'Coffee & Tea'),
    ('Cafes & Coffeehouses',                     'Coffee & Tea'),

    -- ------------------------------------------------------------------ --
    -- Bubble Tea                                                          --
    -- ------------------------------------------------------------------ --
    ('Tea house',                                'Bubble Tea'),

    -- ------------------------------------------------------------------ --
    -- Ice Cream & Frozen Yogurt                                           --
    -- ------------------------------------------------------------------ --
    ('Ice Cream & Frozen Desserts',              'Ice Cream & Frozen Yogurt'),
    ('Frozen yogurt shop',                       'Ice Cream & Frozen Yogurt'),

    -- ------------------------------------------------------------------ --
    -- Desserts                                                            --
    -- ------------------------------------------------------------------ --
    ('Dessert shop',                             'Desserts'),
    ('Desserts/Ice Cream',                       'Desserts'),
    ('Dessert Specialists',                      'Desserts'),
    ('Dessert: Other',                           'Desserts'),
    ('Cupcakes',                                 'Desserts'),
    ('Pastry',                                   'Desserts'),
    ('Pastries',                                 'Desserts'),
    ('Cakes',                                    'Desserts'),
    ('Dessert Restaurants',                      'Desserts'),
    ('chocolatier',                              'Desserts'),

    -- ------------------------------------------------------------------ --
    -- Bakery                                                              --
    -- ------------------------------------------------------------------ --
    ('Donut shop',                               'Bakery'),
    ('Dount',                                    'Bakery'),
    ('Bagel shop',                               'Bakery'),
    ('Bagels',                                   'Bakery'),

    -- ------------------------------------------------------------------ --
    -- Pasta                                                               --
    -- ------------------------------------------------------------------ --
    ('Homemade Pasta',                           'Pasta'),

    -- ------------------------------------------------------------------ --
    -- Italian sub-types                                                   --
    -- ------------------------------------------------------------------ --
    ('Antipasta',                                'Italian'),
    ('Northern Italian restaurant',              'Italian'),
    ('Southern Italian restaurant',              'Italian'),
    ('Italian Cuisine',                          'Italian'),

    -- ------------------------------------------------------------------ --
    -- Sushi                                                               --
    -- ------------------------------------------------------------------ --
    ('Sushi Cuisine',                            'Sushi'),
    ('Sushi takeaway',                           'Sushi'),

    -- ------------------------------------------------------------------ --
    -- Bar / Pub / Gastropub                                               --
    -- ------------------------------------------------------------------ --
    ('bar',                                      'Bar'),
    ('Bars',                                     'Bar'),
    ('Bar / Pub Food',                           'Bar'),
    ('Bar Food',                                 'Bar'),
    ('Bar & Grille Cuisine',                     'Bar & Grill'),
    ('Bar & Grills',                             'Bar & Grill'),
    ('Gastropub',                                'Pub'),
    ('Brewpub',                                  'Pub'),
    ('Brew Pubs',                                'Pub'),
    ('Beer garden',                              'Pub'),
    ('Beer hall',                                'Pub'),
    ('Live music bar',                           'Bar'),
    ('Taverns',                                  'Pub'),
    ('Irish pub',                                'Pub'),
    ('Irish',                                    'Pub'),
    ('Irish restaurant',                         'Pub'),

    -- ------------------------------------------------------------------ --
    -- Lounge                                                              --
    -- ------------------------------------------------------------------ --
    ('Lounge',                                   'Cocktail Bar'),

    -- ------------------------------------------------------------------ --
    -- Halal                                                               --
    -- ------------------------------------------------------------------ --
    ('Halal restaurant',                         'Halal'),

    -- ------------------------------------------------------------------ --
    -- Kosher                                                              --
    -- ------------------------------------------------------------------ --
    ('Kosher restaurant',                        'Kosher'),
    ('Kosher Style',                             'Kosher'),

    -- ------------------------------------------------------------------ --
    -- Breakfast & Brunch                                                  --
    -- ------------------------------------------------------------------ --
    ('Breakfast/Brunch',                         'Breakfast & Brunch'),
    ('Pancake restaurant',                       'Breakfast & Brunch'),
    ('Omelets',                                  'Breakfast & Brunch'),
    ('Omelette',                                 'Breakfast & Brunch'),

    -- ------------------------------------------------------------------ --
    -- Salads                                                              --
    -- ------------------------------------------------------------------ --
    ('Salad shop',                               'Salads'),
    ('salad',                                    'Salads'),

    -- ------------------------------------------------------------------ --
    -- Southern                                                            --
    -- ------------------------------------------------------------------ --
    ('Southern restaurant (US)',                 'Southern'),

    -- ------------------------------------------------------------------ --
    -- Cajun / Creole                                                      --
    -- ------------------------------------------------------------------ --
    ('Cajun restaurant',                         'Cajun'),
    ('Creole restaurant',                        'Cajun'),
    ('Creole',                                   'Cajun'),
    ('Cajun / Creole',                           'Cajun'),
    ('Cajun & Creole',                           'Cajun'),

    -- ------------------------------------------------------------------ --
    -- Healthy / Organic                                                   --
    -- ------------------------------------------------------------------ --
    ('Organic',                                  'Healthy'),
    ('Organic restaurant',                       'Healthy'),
    ('Local/Organic',                            'Healthy'),
    ('Health & Diet Food Products',              'Healthy'),
    ('Heart Healthy Cuisine',                    'Healthy'),

    -- ------------------------------------------------------------------ --
    -- Vegan / Vegetarian extras                                           --
    -- ------------------------------------------------------------------ --
    ('Plant Based',                              'Vegan'),
    ('Vegan Cuisine',                            'Vegan'),
    ('Pure Veg',                                 'Vegetarian'),

    -- ------------------------------------------------------------------ --
    -- American variants                                                   --
    -- ------------------------------------------------------------------ --
    ('Contemporary American',                    'American'),
    ('American (Traditional)',                   'American'),
    ('American Regional',                        'American'),
    ('Pacific Northwest restaurant (US)',        'American'),
    ('Southwestern restaurant (US)',             'American'),
    ('Southwestern',                             'American'),
    ('Country food restaurant',                  'American'),

    -- ------------------------------------------------------------------ --
    -- New American                                                        --
    -- ------------------------------------------------------------------ --
    ('New American restaurant',                  'New American'),

    -- ------------------------------------------------------------------ --
    -- European consolidation                                              --
    -- ------------------------------------------------------------------ --
    ('Eastern European',                         'European'),
    ('Eastern European restaurant',              'European'),
    ('Modern European',                          'European'),
    ('Modern European restaurant',               'European'),
    ('Western',                                  'European'),
    ('Belgian restaurant',                       'European'),
    ('Basque restaurant',                        'European'),
    ('Polish restaurant',                        'European'),
    ('Armenian restaurant',                      'European'),
    ('Russian restaurant',                       'European'),
    ('Russian',                                  'European'),
    ('"""European"""',                           'European'),
    ('"""Continental"""',                        'Continental'),
    ('Continental Restaurants',                  'Continental'),

    -- ------------------------------------------------------------------ --
    -- Latin American consolidation                                        --
    -- ------------------------------------------------------------------ --
    ('South American',                           'Latin American'),
    ('South American restaurant',                'Latin American'),
    ('Nuevo Latino restaurant',                  'Latin American'),
    ('Latin Fusion',                             'Latin American'),
    ('Latin American: Other',                    'Latin American'),
    ('Central American restaurant',              'Latin American'),
    ('Ecuadorian restaurant',                    'Latin American'),
    ('Guatemalan restaurant',                    'Latin American'),
    ('Honduran restaurant',                      'Latin American'),
    ('Argentinian',                              'Latin American'),
    ('Argentinian restaurant',                   'Latin American'),
    ('Venezuelan',                               'Latin American'),
    ('Venezuelan restaurant',                    'Latin American'),

    -- ------------------------------------------------------------------ --
    -- Middle Eastern consolidation                                        --
    -- ------------------------------------------------------------------ --
    ('Arabian',                                  'Middle Eastern'),
    ('Persian restaurant',                       'Middle Eastern'),
    ('Persian',                                  'Middle Eastern'),
    ('Afghan restaurant',                        'Middle Eastern'),
    ('Afghan',                                   'Middle Eastern'),
    ('Falafel',                                  'Middle Eastern'),
    ('Kebab',                                    'Middle Eastern'),
    ('Kebab shop',                               'Middle Eastern'),
    ('Gyro restaurant',                          'Middle Eastern'),
    ('Moroccan restaurant',                      'Middle Eastern'),
    ('Moroccan',                                 'Middle Eastern'),

    -- ------------------------------------------------------------------ --
    -- Indian consolidation                                                --
    -- ------------------------------------------------------------------ --
    ('North Indian',                             'Indian'),
    ('North Indian restaurant',                  'Indian'),
    ('South Indian',                             'Indian'),
    ('Modern Indian restaurant',                 'Indian'),
    ('Biryani',                                  'Indian'),
    ('South Asian',                              'Indian'),
    ('Rice &amp; Curry',                         'Indian'),
    ('Rice Dishes',                              'Indian'),
    ('Himalayan',                                'Indian'),
    ('Nepalese',                                 'Indian'),
    ('Nepalese restaurant',                      'Indian'),

    -- ------------------------------------------------------------------ --
    -- Asian / Asian Fusion                                                --
    -- ------------------------------------------------------------------ --
    ('Asian Cuisine',                            'Asian'),
    ('Asian: Other',                             'Asian'),
    ('Pan Asian',                                'Asian Fusion'),

    -- ------------------------------------------------------------------ --
    -- Chinese sub-types                                                   --
    -- ------------------------------------------------------------------ --
    ('Cantonese restaurant',                     'Chinese'),
    ('Cantonese',                                'Chinese'),
    ('Shanghainese restaurant',                  'Chinese'),
    ('Chinese: Other',                           'Chinese'),
    ('Chinese Cuisine',                          'Chinese'),
    ('Hunan restaurant',                         'Chinese'),
    ('Mandarin restaurant',                      'Chinese'),
    ('Sichuan restaurant',                       'Chinese'),
    ('Chinese takeaway',                         'Chinese'),
    ('Dim sum restaurant',                       'Chinese'),
    ('Dumpling restaurant',                      'Chinese'),
    ('Dumpling House',                           'Chinese'),

    -- ------------------------------------------------------------------ --
    -- Taiwanese (keep separate)                                           --
    -- ------------------------------------------------------------------ --
    ('Taiwanese restaurant',                     'Taiwanese'),
    ('Taiwanese',                                'Taiwanese'),

    -- ------------------------------------------------------------------ --
    -- Japanese sub-types                                                  --
    -- ------------------------------------------------------------------ --
    ('Izakaya restaurant',                       'Japanese'),
    ('Teppanyaki restaurant',                    'Japanese'),
    ('Shabu-shabu restaurant',                   'Japanese'),
    ('Bento',                                    'Japanese'),

    -- ------------------------------------------------------------------ --
    -- Hot Pot                                                             --
    -- ------------------------------------------------------------------ --
    ('Hot pot restaurant',                       'Hot Pot'),

    -- ------------------------------------------------------------------ --
    -- Korean                                                              --
    -- ------------------------------------------------------------------ --
    ('Korean BBQ',                               'Korean'),
    ('Korean restaurant',                        'Korean'),

    -- ------------------------------------------------------------------ --
    -- Mongolian BBQ                                                       --
    -- ------------------------------------------------------------------ --
    ('Mongolian',                                'Mongolian BBQ'),

    -- ------------------------------------------------------------------ --
    -- Vietnamese extras                                                   --
    -- ------------------------------------------------------------------ --
    ('Vietnamese Restaurants',                   'Vietnamese'),

    -- ------------------------------------------------------------------ --
    -- Southeast Asian consolidation                                       --
    -- ------------------------------------------------------------------ --
    ('Laotian restaurant',                       'Southeast Asian'),
    ('Laotian',                                  'Southeast Asian'),
    ('Malaysian restaurant',                     'Southeast Asian'),
    ('Malaysian',                                'Southeast Asian'),
    ('Cambodian restaurant',                     'Southeast Asian'),
    ('Burmese restaurant',                       'Southeast Asian'),
    ('Indonesian restaurant',                    'Southeast Asian'),

    -- ------------------------------------------------------------------ --
    -- African consolidation                                               --
    -- ------------------------------------------------------------------ --
    ('Nigerian',                                 'African'),
    ('African: Other',                           'African'),

    -- ------------------------------------------------------------------ --
    -- Tapas                                                               --
    -- ------------------------------------------------------------------ --
    ('Tapas restaurant',                         'Tapas'),
    ('Tapas bar',                                'Tapas'),
    ('Tapas / Small Plates',                     'Tapas'),
    ('Small plates restaurant',                  'Tapas'),

    -- ------------------------------------------------------------------ --
    -- Crepes                                                              --
    -- ------------------------------------------------------------------ --
    ('Creperie',                                 'Crepes'),
    ('Crepe',                                    'Crepes'),

    -- ------------------------------------------------------------------ --
    -- Fish & Chips                                                        --
    -- ------------------------------------------------------------------ --
    ('Fish & chips restaurant',                  'Fish & Chips'),
    ('Fish &amp; Seafood',                       'Seafood'),

    -- ------------------------------------------------------------------ --
    -- Bowls                                                               --
    -- ------------------------------------------------------------------ --
    ('Rice-bowls',                               'Bowls'),

    -- ------------------------------------------------------------------ --
    -- Burritos                                                            --
    -- ------------------------------------------------------------------ --
    ('Burrito restaurant',                       'Burritos'),

    -- ------------------------------------------------------------------ --
    -- Diner                                                               --
    -- ------------------------------------------------------------------ --
    ('Cafeteria',                                'Diner'),
    ('Cafeterias',                               'Diner'),
    ('Lunch restaurant',                         'Diner'),

    -- ------------------------------------------------------------------ --
    -- Comfort Food extras                                                 --
    -- ------------------------------------------------------------------ --
    ('Mac and Cheese',                           'Comfort Food'),

    -- ------------------------------------------------------------------ --
    -- Family Friendly extras                                              --
    -- ------------------------------------------------------------------ --
    ('"""Family Style Restaurants"""',           'Family Friendly'),
    ('"""Family Style"""',                       'Family Friendly'),

    -- ------------------------------------------------------------------ --
    -- International / Eclectic                                            --
    -- ------------------------------------------------------------------ --
    ('Eclectic & International',                 'International'),
    ('Eclectic restaurant',                      'International'),
    ('Eclectic',                                 'International'),
    ('Global',                                   'International'),

    -- ------------------------------------------------------------------ --
    -- Snack bar                                                           --
    -- ------------------------------------------------------------------ --
    ('Snack bar',                                'Snacks'),

    -- ------------------------------------------------------------------ --
    -- Catering                                                            --
    -- ------------------------------------------------------------------ --
    ('Mobile caterer',                           'Caterers'),

    -- ------------------------------------------------------------------ --
    -- Remaining malformed JSON / encoding artefacts                      --
    -- ------------------------------------------------------------------ --
    ('[""Take Out Restaurants""',                NULL),
    ('[""Restaurants""',                         NULL),
    ('[""American""',                            'American'),
    ('[""Vegetarian""]',                         'Vegetarian'),
    ('"""Vegetarian""]"',                        'Vegetarian'),
    ('"""Asian Restaurants"""',                  'Asian'),
    ('"""Asian"""',                              'Asian'),
    ('"""American Restaurants"""',               'American'),
    ('"""Mexican"""',                            'Mexican'),
    ('"""Mediterranean"""',                      'Mediterranean'),
    ('"""Breakfast Brunch & Lunch Restaurants"', 'Breakfast & Brunch'),
    ('"""Vegetarian Restaurants"""',             'Vegetarian'),
    ('"""Caterers"""',                           'Caterers'),
    ('""""',                                     NULL),
    ('"""Vegan""]"',                             'Vegan'),
    ('"""Italian Restaurants"""',                'Italian'),
    ('[""Caterers""',                            'Caterers'),
    ('[""Pizza""]',                              'Pizza'),
    ('"[""Take Out Restaurants"""',             NULL),

    -- ------------------------------------------------------------------ --
    -- Service tags — remove entirely                                      --
    -- ------------------------------------------------------------------ --
    ('Takeout',                                  NULL),
    ('Delivery',                                 NULL),
    ('Exclusive to Eats',                        NULL),
    ('Alcohol',                                  NULL),
    ('Drinks',                                   NULL),
    ('Beer',                                     NULL),
    ('Wine',                                     NULL),
    ('Restaurant Delivery Service',              NULL),
    ('Restaurant Menus',                         NULL),
    ('Food and drink',                           NULL),

    -- ------------------------------------------------------------------ --
    -- Ownership tags — remove (not a cuisine category)                   --
    -- ------------------------------------------------------------------ --
    ('Black-owned',                              NULL),
    ('Women-owned',                              NULL),
    ('AAPI-owned',                               NULL),
    ('Asian-owned',                              NULL),

    -- ------------------------------------------------------------------ --
    -- Junk / noise — remove                                               --
    -- ------------------------------------------------------------------ --
    ('Other',                                    NULL),
    ('Other Cuisine',                            NULL),
    ('Aa',                                       NULL),
    ('Aa shop',                                  NULL),
    ('Association or organization',              NULL),
    ('Bowling alley',                            NULL),
    ('Event venue',                              NULL),
    ('Casino',                                   NULL),
    ('Bed & breakfast',                          NULL),
    ('Inn',                                      NULL),
    ('Truck stop',                               NULL),
    ('Night club',                               NULL),
    ('Night Clubs',                              NULL),
    ('Club',                                     NULL),
    ('Affordable Meals',                         NULL),
    ('Local Specialities',                       NULL),
    ('Contemporary',                             NULL),
    ('Gourmet',                                  NULL),
    ('Specialty Foods',                          NULL),
    ('Food court',                               NULL),
    ('Party Trays',                              NULL),
    ('Banquet hall',                             NULL),
    ('Banquet Halls & Reception Facilities',     NULL),
    ('Rolls',                                    NULL);

-- ------------------------------------------------------------------ --
-- Apply mapping with NULL-deletion support                            --
-- ------------------------------------------------------------------ --
with normalized as (
    select
        r.id,
        array(
            select distinct
                case when m.old_cat is null then elem else m.new_cat end
            from unnest(r.cat_list) as elem
            left join _cat_map m on m.old_cat = elem
            -- keep unmapped elements (m.old_cat IS NULL) and mapped-to-non-null
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

drop table _cat_map;

-- ------------------------------------------------------------------ --
-- Refresh materialized view and all server-side caches               --
-- ------------------------------------------------------------------ --
refresh materialized view concurrently public.restaurants_category_counts;
select public.refresh_overview_cache();
select public.refresh_map_cache();

commit;
