-- LocalLoop · 0013 · reference data required in every environment
-- (settings, categories, launch area). Demo/test businesses are NOT here —
-- they live in supabase/seed.sql, flagged is_demo, and load only locally.

insert into public.app_settings (key, value, is_public, description) values
  -- commercial (placeholders: confirm before launch in Admin → Settings)
  ('commission_rate_default',       '0.10',  false, 'Platform commission on item subtotal (0–1). Vendor override takes precedence.'),
  ('delivery_fee_base',             '20',    true,  'Delivery fee (₹) covering the first delivery_fee_base_km.'),
  ('delivery_fee_base_km',          '2',     true,  'Road-km included in the base fee.'),
  ('delivery_fee_per_km',           '8',     true,  'Fee (₹) per additional road-km.'),
  ('free_delivery_min_subtotal',    'null',  true,  'Subtotal (₹) above which delivery is free; null disables.'),
  ('delivery_fee_gst_rate',         '0',     true,  'GST rate applied to the delivery fee (0–1). Item prices are GST-inclusive.'),
  ('partner_pay_base',              '25',    false, 'Partner earning (₹) per completed delivery.'),
  ('partner_pay_per_km',            '6',     false, 'Partner earning (₹) per road-km of the delivery leg.'),
  -- listing estimates
  ('listing_road_factor',           '1.4',   false, 'Multiplier from straight-line to approximate road distance for listing estimates and fees.'),
  ('listing_avg_speed_kmph',        '18',    false, 'Average two-wheeler speed for listing delivery-time estimates.'),
  -- dispatch
  ('offer_timeout_seconds',         '45',    false, 'Seconds a partner has to accept an offer.'),
  ('offers_per_round',              '3',     false, 'Partners offered each order per dispatch round.'),
  ('dispatch_radius_km',            '5',     false, 'Max partner→store distance for offers.'),
  ('partner_location_fresh_seconds','120',   false, 'Partner GPS fix must be newer than this to receive offers.'),
  ('max_active_deliveries_per_partner','1',  false, 'Concurrent accepted deliveries per partner.'),
  ('bicycle_max_trip_km',           '3',     false, 'Bicycle partners are offered only trips up to this store→customer distance.'),
  -- live tracking / ETA cost control
  ('eta_refresh_interval_seconds',  '60',    false, 'Recompute route ETA at least this often during a delivery.'),
  ('eta_refresh_distance_m',        '250',   false, 'Recompute route ETA when the partner has moved this far since the last route.'),
  ('approaching_threshold_seconds', '180',   false, 'Send "partner approaching" when road ETA drops below this.'),
  ('max_location_accuracy_m',       '500',   false, 'Ignore GPS fixes worse than this accuracy.'),
  ('location_retention_days',       '30',    false, 'Delete partner location history older than this.'),
  -- delivery verification
  ('pickup_geofence_m',             '200',   false, 'Partner must be within this distance of the store to confirm pickup (null disables).'),
  ('delivery_geofence_m',           '500',   false, 'Partner must be within this distance of the drop to complete (null disables).'),
  ('delivery_otp_max_attempts',     '5',     false, 'Wrong OTP attempts before the order is locked for support.'),
  -- abuse limits & moderation
  ('max_orders_per_10min',          '5',     false, 'Per-customer order rate limit.'),
  ('review_window_days',            '30',    false, 'Days after delivery during which a review may be written.'),
  ('review_report_threshold',       '3',     false, 'Reports that move a review to moderation.'),
  -- environment
  ('test_payments_enabled',         'false', true,  'Allow the "test payment" method (pilot/QA only — no money moves).'),
  ('show_demo_data',                'false', false, 'Show stores flagged is_demo. Must be false in production.'),
  ('support_phone',                 'null',  true,  'Customer support phone shown in the apps.')
on conflict (key) do nothing;

insert into public.categories (kind, slug, name_en, name_te, icon, sort_order) values
  ('store', 'grocery',           'Grocery & Kirana',      'కిరాణా దుకాణం',          'basket',      10),
  ('store', 'supermarket',       'Supermarket',           'సూపర్ మార్కెట్',          'cart',        20),
  ('store', 'vegetables-fruits', 'Vegetables & Fruits',   'కూరగాయలు & పండ్లు',       'leaf',        30),
  ('store', 'restaurant',        'Restaurant',            'రెస్టారెంట్',             'restaurant',  40),
  ('store', 'bakery',            'Bakery',                'బేకరీ',                  'bakery',      50),
  ('store', 'sweets',            'Sweet Shop',            'స్వీట్ షాప్',             'sweets',      60),
  ('store', 'dairy',             'Dairy',                 'పాల కేంద్రం',            'milk',        70),
  ('store', 'meat-fish',         'Meat & Fish',           'మాంసం & చేపలు',          'fish',        80),
  ('store', 'general-store',     'General Store',         'జనరల్ స్టోర్',            'store',       90),
  ('product', 'staples',         'Staples',               'నిత్యావసరాలు',           'grain',       10),
  ('product', 'vegetables',      'Vegetables',            'కూరగాయలు',              'leaf',        20),
  ('product', 'fruits',          'Fruits',                'పండ్లు',                 'apple',       30),
  ('product', 'dairy-eggs',      'Dairy & Eggs',          'పాలు & గుడ్లు',           'milk',        40),
  ('product', 'bakery-items',    'Bread & Bakery',        'బ్రెడ్ & బేకరీ',           'bakery',      50),
  ('product', 'snacks',          'Snacks',                'స్నాక్స్',                'snack',       60),
  ('product', 'beverages',       'Beverages',             'పానీయాలు',              'cup',         70),
  ('product', 'meals',           'Meals',                 'భోజనం',                 'restaurant',  80),
  ('product', 'sweets-desserts', 'Sweets & Desserts',     'మిఠాయిలు',              'sweets',      90),
  ('product', 'meat-fish-items', 'Meat & Fish',           'మాంసం & చేపలు',          'fish',       100),
  ('product', 'personal-care',   'Personal Care',         'వ్యక్తిగత సంరక్షణ',        'care',       110),
  ('product', 'household',       'Household',             'గృహోపకరణాలు',            'home',       120)
on conflict (slug) do nothing;

-- Launch market. Center is Kamareddy town; radius covers the town and nearby
-- villages. Refine (or draw a boundary) in Admin → Serviceable areas.
insert into public.serviceable_areas (name, city, state, center, radius_km, is_active)
values ('Kamareddy', 'Kamareddy', 'Telangana', public._point(18.3203, 78.3370), 12, true)
on conflict (name, state) do nothing;
