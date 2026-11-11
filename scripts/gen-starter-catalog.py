#!/usr/bin/env python3
"""Turns supabase/catalog/starter.txt into the catalogue seed migration.

Usage: python3 scripts/gen-starter-catalog.py <output .sql>
Size labels are read the same way as Admin's "size | MRP" lines
(packages/shared/src/utils/catalog.ts).
"""
import json, re, sys
from pathlib import Path

UNITS = [
    (r"^(kg|kgs|kilo|kilos|kilogram|kilograms)$", "kg"), (r"^(g|gm|gms|gram|grams|gr)$", "g"),
    (r"^(l|ltr|ltrs|litre|litres|liter|liters)$", "l"), (r"^(ml|mls|millilitre|millilitres|milliliter|milliliters)$", "ml"),
    (r"^(pc|pcs|piece|pieces|nos|no|unit|units)$", "piece"), (r"^(pkt|pkts|packet|packets|pack|packs|pouch|sachet)$", "packet"),
    (r"^(box|boxes|carton)$", "box"), (r"^(dozen|dz|doz)$", "dozen"),
]

def size(label):
    m = re.search(r"(\d+(?:\.\d+)?)\s*([a-z]+)", label, re.I)
    pack = re.search(r"(?:pack\s+of|set\s+of)\s*(\d+)", label, re.I)
    unit, qty = "piece", 1.0
    if m:
        for pat, u in UNITS:
            if re.match(pat, m.group(2), re.I):
                unit, qty = u, float(m.group(1))
                break
    elif pack:
        qty = float(pack.group(1))
    q = int(qty) if qty.is_integer() else qty
    return {"label": label, "unit": unit, "unit_quantity": q}

def lit(s):
    return "'" + s.replace("'", "''") + "'"

def arr(items):
    return "array[" + ", ".join(lit(x) for x in items) + "]::text[]"

src = Path(__file__).resolve().parent.parent / "supabase/catalog/starter.txt"
rows, seen = [], set()
for n, line in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
    if not line.strip() or line.startswith("#"):
        continue
    f = [x.strip() for x in line.split("|")]
    if len(f) != 9:
        sys.exit(f"line {n}: expected 9 fields, got {len(f)}")
    cat, name, te, brand, sizes, desc, desc_te, hl, hl_te = f
    if name.lower() in seen:
        sys.exit(f"line {n}: duplicate {name}")
    seen.add(name.lower())
    hl, hl_te = [x.strip() for x in hl.split(";") if x.strip()], [x.strip() for x in hl_te.split(";") if x.strip()]
    sz = [size(x.strip()) for x in sizes.split(";") if x.strip()]
    assert 2 <= len(name) <= 120 and len(brand) <= 60 and len(hl) <= 8 and len(hl_te) <= 8 and 1 <= len(sz) <= 10, n
    rows.append(f"  ({lit(cat)}, {lit(name)}, {lit(te)}, {lit(brand)}, {lit(desc)}, {lit(desc_te)}, {arr(hl)}, {arr(hl_te)}, {lit(json.dumps(sz, ensure_ascii=False))}::jsonb)")

out = f"""-- LocalLoop · 0026 · starter product catalogue
-- {len(rows)} everyday products for Kamareddy kirana, vegetable and general
-- stores, so shop owners have plenty to pick from on day one. No photos or MRP:
-- add photos in Admin → Catalogue → Product catalogue; shops set their own price.
-- Generated from supabase/catalog/starter.txt by scripts/gen-starter-catalog.py.
-- Products already in the catalogue (same name) are left alone.

insert into public.catalog_templates (category_id, name, name_te, brand, description, description_te, highlights, highlights_te, sizes)
select c.id, v.name, v.name_te, v.brand, v.description, v.description_te, v.highlights, v.highlights_te, v.sizes
from (values
{",\n".join(rows)}
) as v (category, name, name_te, brand, description, description_te, highlights, highlights_te, sizes)
join public.categories c on c.slug = v.category and c.kind = 'product'
where not exists (select 1 from public.catalog_templates t where lower(t.name) = lower(v.name));
"""
Path(sys.argv[1]).write_text(out, encoding="utf-8")
print(f"{len(rows)} products → {sys.argv[1]}")
