#!/usr/bin/env python3
"""Exports every app string as English/Telugu pairs for a native-speaker review.

    python scripts/export-translations.py            # writes telugu-review.csv

Open the CSV in Excel or Google Sheets. Reviewers write corrections in the
"Corrected Telugu" column; apply them to apps/mobile/src/translations/te.json
(keep {{placeholders}} exactly as they are).
"""
import csv, json, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'apps/mobile/src/translations'
en = json.loads((root / 'en.json').read_text(encoding='utf-8'))
te = json.loads((root / 'te.json').read_text(encoding='utf-8'))

def flat(d, prefix=''):
    for k, v in d.items():
        key = f'{prefix}{k}'
        if isinstance(v, dict):
            yield from flat(v, key + '.')
        else:
            yield key, v

te_flat = dict(flat(te))
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'telugu-review.csv')
# utf-8-sig adds the byte-order mark Excel needs to show Telugu correctly.
f = out.open('w', encoding='utf-8-sig', newline='')
w = csv.writer(f)
w.writerow(['Key', 'Screen area', 'English', 'Telugu (current)', 'Corrected Telugu', 'Notes'])
for key, text in flat(en):
    w.writerow([key, key.split('.')[0], text, te_flat.get(key, ''), '', ''])
f.close()
print(f'wrote {out}')
