-- ============================================================================
-- 0012_normalize_categories.sql
-- Consolidates messy cat_list values that accumulated from multiple ingest
-- sources: "restaurant"-suffix duplicates, plural variants, HTML entities,
-- JSON-parse artefacts (leading quote, trailing bracket), and
-- inconsistent capitalisation.
--
-- Strategy: build a temporary mapping table, then for each restaurant row
-- replace every matching element in cat_list with its canonical name and
-- deduplicate. Only rows where cat_list actually changes are written.
-- After the UPDATE, the restaurants_category_counts MV and all caches are
-- refreshed so the UI immediately reflects the cleaned data.
-- ============================================================================

begin;

-- Mapping: old value → canonical value
create temp table _cat_map (old_cat text primary key, new_cat text not null);

insert into _cat_map (old_cat, new_cat) values
    -- ------------------------------------------------------------------ --
    -- Generic / duplicate "restaurant(s)" wrappers                       --
    -- ------------------------------------------------------------------ --
    ('restaurant',                              'Restaurant'),
    ('Restaurants',                             'Restaurant'),
    ('"Restaurants"',                           'Restaurant'),

    -- ------------------------------------------------------------------ --
    -- American                                                            --
    -- ------------------------------------------------------------------ --
    ('American restaurant',                     'American'),
    ('American Restaurants',                    'American'),
    ('American Cuisine',                        'American'),
    ('Traditional American',                    'American'),
    ('Traditional American restaurant',         'American'),
    ('"American"',                              'American'),
    ('"American',                               'American'),

    -- ------------------------------------------------------------------ --
    -- Mexican                                                             --
    -- ------------------------------------------------------------------ --
    ('Mexican restaurant',                      'Mexican'),
    ('Mexican Restaurants',                     'Mexican'),

    -- ------------------------------------------------------------------ --
    -- Italian                                                             --
    -- ------------------------------------------------------------------ --
    ('Italian restaurant',                      'Italian'),
    ('Italian Restaurants',                     'Italian'),
    ('Italian Dishes',                          'Italian'),
    ('"Italian Restaurants"',                   'Italian'),
    ('"Italian"',                               'Italian'),

    -- ------------------------------------------------------------------ --
    -- Chinese                                                             --
    -- ------------------------------------------------------------------ --
    ('Chinese restaurant',                      'Chinese'),
    ('Chinese Restaurants',                     'Chinese'),

    -- ------------------------------------------------------------------ --
    -- Thai                                                                --
    -- ------------------------------------------------------------------ --
    ('Thai restaurant',                         'Thai'),
    ('Thai Restaurants',                        'Thai'),

    -- ------------------------------------------------------------------ --
    -- Japanese                                                            --
    -- ------------------------------------------------------------------ --
    ('Japanese restaurant',                     'Japanese'),
    ('Japanese Restaurants',                    'Japanese'),
    ('Authentic Japanese restaurant',           'Japanese'),

    -- ------------------------------------------------------------------ --
    -- Sushi                                                               --
    -- ------------------------------------------------------------------ --
    ('Sushi restaurant',                        'Sushi'),
    ('Sushi Bars',                              'Sushi'),
    ('Japanese: Sushi',                         'Sushi'),

    -- ------------------------------------------------------------------ --
    -- Seafood                                                             --
    -- ------------------------------------------------------------------ --
    ('Seafood restaurant',                      'Seafood'),
    ('Seafood Restaurants',                     'Seafood'),
    ('Seafood Dishes',                          'Seafood'),
    ('Seafood Cuisine',                         'Seafood'),

    -- ------------------------------------------------------------------ --
    -- BBQ                                                                 --
    -- ------------------------------------------------------------------ --
    ('Barbecue restaurant',                     'BBQ'),
    ('Barbecue',                                'BBQ'),
    ('Barbecue Restaurants',                    'BBQ'),

    -- ------------------------------------------------------------------ --
    -- Vietnamese                                                          --
    -- ------------------------------------------------------------------ --
    ('Vietnamese restaurant',                   'Vietnamese'),

    -- ------------------------------------------------------------------ --
    -- Indian                                                              --
    -- ------------------------------------------------------------------ --
    ('Indian restaurant',                       'Indian'),
    ('Indian Restaurants',                      'Indian'),
    ('Indian Curry',                            'Indian'),

    -- ------------------------------------------------------------------ --
    -- Mediterranean                                                       --
    -- ------------------------------------------------------------------ --
    ('Mediterranean restaurant',                'Mediterranean'),
    ('Mediterranean Restaurants',               'Mediterranean'),

    -- ------------------------------------------------------------------ --
    -- Greek                                                               --
    -- ------------------------------------------------------------------ --
    ('Greek restaurant',                        'Greek'),
    ('Greek Restaurants',                       'Greek'),

    -- ------------------------------------------------------------------ --
    -- Latin American                                                      --
    -- ------------------------------------------------------------------ --
    ('Latin American restaurant',               'Latin American'),
    ('Latin American Restaurants',              'Latin American'),

    -- ------------------------------------------------------------------ --
    -- Korean                                                              --
    -- ------------------------------------------------------------------ --
    ('Korean restaurant',                       'Korean'),
    ('Korean barbecue restaurant',              'Korean BBQ'),
    ('Mongolian barbecue restaurant',           'Mongolian BBQ'),

    -- ------------------------------------------------------------------ --
    -- Asian                                                               --
    -- ------------------------------------------------------------------ --
    ('Asian restaurant',                        'Asian'),
    ('Asian Restaurants',                       'Asian'),
    ('Asian fusion restaurant',                 'Asian Fusion'),
    ('Pan-Asian restaurant',                    'Pan Asian'),

    -- ------------------------------------------------------------------ --
    -- Fast Food                                                           --
    -- ------------------------------------------------------------------ --
    ('Fast food restaurant',                    'Fast Food'),
    ('Fast Food Restaurants',                   'Fast Food'),

    -- ------------------------------------------------------------------ --
    -- Burgers                                                             --
    -- ------------------------------------------------------------------ --
    ('Hamburger restaurant',                    'Burgers'),
    ('Hamburgers',                              'Burgers'),
    ('Hamburgers & Hot Dogs',                   'Burgers'),

    -- ------------------------------------------------------------------ --
    -- Steakhouse                                                          --
    -- ------------------------------------------------------------------ --
    ('Steak house',                             'Steakhouse'),
    ('Steak Houses',                            'Steakhouse'),
    ('Steaks & Chops Cuisine',                  'Steakhouse'),

    -- ------------------------------------------------------------------ --
    -- Chicken                                                             --
    -- ------------------------------------------------------------------ --
    ('Chicken restaurant',                      'Chicken'),

    -- ------------------------------------------------------------------ --
    -- Soul Food                                                           --
    -- ------------------------------------------------------------------ --
    ('Soul food restaurant',                    'Soul Food'),

    -- ------------------------------------------------------------------ --
    -- Ramen                                                               --
    -- ------------------------------------------------------------------ --
    ('Ramen restaurant',                        'Ramen'),

    -- ------------------------------------------------------------------ --
    -- Caribbean                                                           --
    -- ------------------------------------------------------------------ --
    ('Caribbean restaurant',                    'Caribbean'),

    -- ------------------------------------------------------------------ --
    -- Cajun                                                               --
    -- ------------------------------------------------------------------ --
    ('Cajun restaurant',                        'Cajun'),

    -- ------------------------------------------------------------------ --
    -- Healthy                                                             --
    -- ------------------------------------------------------------------ --
    ('Health food restaurant',                  'Healthy'),
    ('Health Food Restaurants',                 'Healthy'),
    ('Health Food',                             'Healthy'),

    -- ------------------------------------------------------------------ --
    -- Tacos                                                               --
    -- ------------------------------------------------------------------ --
    ('Taco restaurant',                         'Tacos'),

    -- ------------------------------------------------------------------ --
    -- Ethiopian                                                           --
    -- ------------------------------------------------------------------ --
    ('Ethiopian restaurant',                    'Ethiopian'),

    -- ------------------------------------------------------------------ --
    -- German                                                              --
    -- ------------------------------------------------------------------ --
    ('German restaurant',                       'German'),

    -- ------------------------------------------------------------------ --
    -- Vegan                                                               --
    -- ------------------------------------------------------------------ --
    ('Vegan restaurant',                        'Vegan'),
    ('Vegan Restaurants',                       'Vegan'),
    ('Vegan Friendly',                          'Vegan'),
    ('"Vegan"]',                                'Vegan'),

    -- ------------------------------------------------------------------ --
    -- Vegetarian                                                          --
    -- ------------------------------------------------------------------ --
    ('Vegetarian Restaurants',                  'Vegetarian'),
    ('Vegetarian Friendly',                     'Vegetarian'),
    ('Vegetarian-Friendly',                     'Vegetarian'),
    ('Vegetarian / Vegan',                      'Vegetarian'),
    ('Vegetarian Cuisine',                      'Vegetarian'),
    ('Vegetarian restaurant',                   'Vegetarian'),
    ('"Vegetarian"',                            'Vegetarian'),
    ('"Vegetarian Restaurants"',                'Vegetarian'),
    ('Vegetarian"',                             'Vegetarian'),
    ('Vegetarian"]',                            'Vegetarian'),
    ('Vegetarian Toppings',                     'Vegetarian'),

    -- ------------------------------------------------------------------ --
    -- French                                                              --
    -- ------------------------------------------------------------------ --
    ('French restaurant',                       'French'),

    -- ------------------------------------------------------------------ --
    -- Jamaican                                                            --
    -- ------------------------------------------------------------------ --
    ('Jamaican restaurant',                     'Jamaican'),

    -- ------------------------------------------------------------------ --
    -- Middle Eastern                                                      --
    -- ------------------------------------------------------------------ --
    ('Middle Eastern restaurant',               'Middle Eastern'),
    ('Middle Eastern Restaurants',              'Middle Eastern'),

    -- ------------------------------------------------------------------ --
    -- Peruvian                                                            --
    -- ------------------------------------------------------------------ --
    ('Peruvian restaurant',                     'Peruvian'),

    -- ------------------------------------------------------------------ --
    -- Tex-Mex                                                             --
    -- ------------------------------------------------------------------ --
    ('Tex-Mex restaurant',                      'Tex-Mex'),
    ('Tex Mex',                                 'Tex-Mex'),

    -- ------------------------------------------------------------------ --
    -- Fine Dining                                                         --
    -- ------------------------------------------------------------------ --
    ('Fine dining restaurant',                  'Fine Dining'),
    ('Fine Dining Restaurants',                 'Fine Dining'),

    -- ------------------------------------------------------------------ --
    -- Buffet                                                              --
    -- ------------------------------------------------------------------ --
    ('Buffet restaurant',                       'Buffet'),

    -- ------------------------------------------------------------------ --
    -- Hawaiian                                                            --
    -- ------------------------------------------------------------------ --
    ('Hawaiian restaurant',                     'Hawaiian'),

    -- ------------------------------------------------------------------ --
    -- African                                                             --
    -- ------------------------------------------------------------------ --
    ('African restaurant',                      'African'),
    ('West African restaurant',                 'African'),

    -- ------------------------------------------------------------------ --
    -- Brazilian                                                           --
    -- ------------------------------------------------------------------ --
    ('Brazilian restaurant',                    'Brazilian'),

    -- ------------------------------------------------------------------ --
    -- Filipino                                                            --
    -- ------------------------------------------------------------------ --
    ('Filipino restaurant',                     'Filipino'),

    -- ------------------------------------------------------------------ --
    -- Colombian                                                           --
    -- ------------------------------------------------------------------ --
    ('Colombian restaurant',                    'Colombian'),

    -- ------------------------------------------------------------------ --
    -- Dominican                                                           --
    -- ------------------------------------------------------------------ --
    ('Dominican restaurant',                    'Dominican'),

    -- ------------------------------------------------------------------ --
    -- Salvadoran                                                          --
    -- ------------------------------------------------------------------ --
    ('Salvadoran restaurant',                   'Salvadoran'),
    ('Salvadorian',                             'Salvadoran'),

    -- ------------------------------------------------------------------ --
    -- Cuban                                                               --
    -- ------------------------------------------------------------------ --
    ('Cuban restaurant',                        'Cuban'),

    -- ------------------------------------------------------------------ --
    -- Puerto Rican                                                        --
    -- ------------------------------------------------------------------ --
    ('Puerto Rican restaurant',                 'Puerto Rican'),

    -- ------------------------------------------------------------------ --
    -- Lebanese                                                            --
    -- ------------------------------------------------------------------ --
    ('Lebanese restaurant',                     'Lebanese'),

    -- ------------------------------------------------------------------ --
    -- Pakistani                                                           --
    -- ------------------------------------------------------------------ --
    ('Pakistani restaurant',                    'Pakistani'),

    -- ------------------------------------------------------------------ --
    -- Turkish                                                             --
    -- ------------------------------------------------------------------ --
    ('Turkish restaurant',                      'Turkish'),

    -- ------------------------------------------------------------------ --
    -- New American                                                        --
    -- ------------------------------------------------------------------ --
    ('New American restaurant',                 'New American'),

    -- ------------------------------------------------------------------ --
    -- Sandwiches                                                          --
    -- ------------------------------------------------------------------ --
    ('Sandwich shop',                           'Sandwiches'),
    ('Sandwich Shops',                          'Sandwiches'),
    ('Sandwich',                                'Sandwiches'),
    ('Sandwiches/Subs',                         'Sandwiches'),
    ('Sandwiches Cuisine',                      'Sandwiches'),

    -- ------------------------------------------------------------------ --
    -- Coffee & Tea (HTML entity + variant names)                         --
    -- ------------------------------------------------------------------ --
    ('Coffee and Tea',                          'Coffee & Tea'),
    ('Coffee &amp; Tea',                        'Coffee & Tea'),
    ('Coffee shop',                             'Coffee & Tea'),
    ('Coffee Shops',                            'Coffee & Tea'),
    ('Coffee House',                            'Coffee & Tea'),
    ('Coffee & Espresso Restaurants',           'Coffee & Tea'),

    -- ------------------------------------------------------------------ --
    -- Ice Cream & Frozen Yogurt (HTML entity + variant names)            --
    -- ------------------------------------------------------------------ --
    ('Ice Cream &amp; Frozen Yogurt',           'Ice Cream & Frozen Yogurt'),
    ('Ice Cream + Frozen Yogurt',               'Ice Cream & Frozen Yogurt'),
    ('Ice cream shop',                          'Ice Cream & Frozen Yogurt'),
    ('Ice Cream',                               'Ice Cream & Frozen Yogurt'),

    -- ------------------------------------------------------------------ --
    -- Breakfast & Brunch                                                  --
    -- ------------------------------------------------------------------ --
    ('Breakfast and Brunch',                    'Breakfast & Brunch'),
    ('Breakfast &amp; Brunch',                  'Breakfast & Brunch'),
    ('Breakfast restaurant',                    'Breakfast & Brunch'),
    ('Brunch restaurant',                       'Breakfast & Brunch'),
    ('Breakfast Brunch & Lunch Restaurants',    'Breakfast & Brunch'),

    -- ------------------------------------------------------------------ --
    -- Bar & Grill                                                         --
    -- ------------------------------------------------------------------ --
    ('Bar & grill',                             'Bar & Grill'),
    ('Bar & Grills',                            'Bar & Grill'),

    -- ------------------------------------------------------------------ --
    -- Family Friendly                                                     --
    -- ------------------------------------------------------------------ --
    ('Family restaurant',                       'Family Friendly'),
    ('Family Style Restaurants',                'Family Friendly'),
    ('Family Style',                            'Family Friendly'),
    ('Family Style Cuisine',                    'Family Friendly'),

    -- ------------------------------------------------------------------ --
    -- Deli                                                                --
    -- ------------------------------------------------------------------ --
    ('Delicatessen',                            'Deli'),
    ('Delicatessens',                           'Deli'),
    ('Full Delicatessen',                       'Deli'),

    -- ------------------------------------------------------------------ --
    -- Bakery                                                              --
    -- ------------------------------------------------------------------ --
    ('Bakeries',                                'Bakery'),

    -- ------------------------------------------------------------------ --
    -- Pub / Bar variants                                                  --
    -- ------------------------------------------------------------------ --
    ('Irish pub',                               'Pub'),
    ('Sports bar',                              'Sports Bar'),
    ('Cocktail bar',                            'Cocktail Bar'),
    ('Wine bar',                                'Wine Bar'),

    -- ------------------------------------------------------------------ --
    -- Catering                                                            --
    -- ------------------------------------------------------------------ --
    ('Caterer',                                 'Caterers'),
    ('"Caterers"',                              'Caterers'),

    -- ------------------------------------------------------------------ --
    -- Soup                                                                --
    -- ------------------------------------------------------------------ --
    ('Soups',                                   'Soup'),

    -- ------------------------------------------------------------------ --
    -- Desserts                                                            --
    -- ------------------------------------------------------------------ --
    ('Dessert',                                 'Desserts'),
    ('Dessert Restaurants',                     'Desserts'),

    -- ------------------------------------------------------------------ --
    -- Southeast Asian                                                     --
    -- ------------------------------------------------------------------ --
    ('South East Asian',                        'Southeast Asian'),
    ('Southeast Asian restaurant',              'Southeast Asian'),

    -- ------------------------------------------------------------------ --
    -- Gluten Free                                                         --
    -- ------------------------------------------------------------------ --
    ('Gluten Free Friendly',                    'Gluten Free'),

    -- ------------------------------------------------------------------ --
    -- European                                                            --
    -- ------------------------------------------------------------------ --
    ('European restaurant',                     'European'),

    -- ------------------------------------------------------------------ --
    -- Fusion                                                              --
    -- ------------------------------------------------------------------ --
    ('Fusion restaurant',                       'Fusion'),

    -- ------------------------------------------------------------------ --
    -- Poke                                                                --
    -- ------------------------------------------------------------------ --
    ('Poke bar',                                'Poke'),

    -- ------------------------------------------------------------------ --
    -- Takeout / Delivery (service tags from some datasets)               --
    -- ------------------------------------------------------------------ --
    ('Take Out Restaurants',                    'Takeout'),
    ('Takeout restaurant',                      'Takeout'),
    ('[\"Take Out Restaurants\"',               'Takeout'),
    ('meal_takeaway',                           'Takeout'),
    ('meal_delivery',                           'Delivery'),
    ('Meal delivery',                           'Delivery'),

    -- ------------------------------------------------------------------ --
    -- Malformed JSON artefacts                                            --
    -- ------------------------------------------------------------------ --
    ('"Pizza"]',                                'Pizza');

-- ------------------------------------------------------------------ --
-- Apply mapping: replace matched elements, deduplicate within each row
-- ------------------------------------------------------------------ --
with normalized as (
    select
        r.id,
        array(
            select distinct coalesce(m.new_cat, elem)
            from unnest(r.cat_list) as elem
            left join _cat_map m on m.old_cat = elem
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
-- Refresh the materialized view and all server-side caches            --
-- ------------------------------------------------------------------ --
refresh materialized view concurrently public.restaurants_category_counts;
select public.refresh_overview_cache();
select public.refresh_map_cache();

commit;
