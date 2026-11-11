# Product catalogue

LocalLoop's own list of common products. When a shop owner starts typing a
product name in **Products → Add product**, matching catalogue products appear
under the name field with a photo. Tapping one fills in:

- English and Telugu name, description and benefits
- category
- the usual sizes, with the MRP as the starting price

The shop owner checks the price, enters their stock and saves; the catalogue
photos are attached to their product automatically. Everything stays editable
in their copy. Later changes to the catalogue entry don't touch products shops
already added.

## Adding products (Admin → Catalogue → Product catalogue)
- **Name** (English, Telugu) and **brand** are what shop owners search by —
  spelling mistakes still match.
- **Benefits**: one per line, up to 8. Shown to customers under "Benefits".
- **Sizes**: one per line as `size | MRP`, e.g. `1 kg | 72`, `500 ml | 34`,
  `Pack of 6 | 120`. The unit is read from the size.
- **Photos**: up to 5, square, plain background, under 5 MB. The first is the cover.
  Use your own photos or the brand's official product images you're allowed to use.
- **Hide** takes an entry out of search without affecting shops that use it.

Start with what Kamareddy kirana shops sell most: rice, atta, dal, oil, sugar,
salt, tea, milk, biscuits, soaps, detergents.

Who can edit: super admins and operations admins (the `catalog` permission).

## Starter catalogue
Migration `0026` loads 185 everyday products (rice, atta, dals, oils, spices,
dairy, bread, snacks, drinks, vegetables, fruits, personal care, household),
without photos or MRP. To add more in bulk, append lines to
`supabase/catalog/starter.txt`, run
`python3 scripts/gen-starter-catalog.py supabase/migrations/<new timestamp>_more_catalogue.sql`
and push; products whose name already exists are skipped.
