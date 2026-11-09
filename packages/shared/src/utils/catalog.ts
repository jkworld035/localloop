import type { ProductUnit } from '../constants/catalog';

export interface CatalogSizeLine {
  label: string;
  unit: ProductUnit;
  unit_quantity: number;
  mrp: number | null;
}

const UNIT_WORDS: [RegExp, ProductUnit][] = [
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/i, 'kg'],
  [/^(g|gm|gms|gram|grams|gr)$/i, 'g'],
  [/^(l|ltr|ltrs|litre|litres|liter|liters)$/i, 'l'],
  [/^(ml|mls|millilitre|millilitres|milliliter|milliliters)$/i, 'ml'],
  [/^(pc|pcs|piece|pieces|nos|no|unit|units)$/i, 'piece'],
  [/^(pkt|pkts|packet|packets|pack|packs|pouch|sachet)$/i, 'packet'],
  [/^(box|boxes|carton)$/i, 'box'],
  [/^(dozen|dz|doz)$/i, 'dozen'],
];

/**
 * One size per line, written the way shops label them: "1 kg | 72",
 * "500g, 38", "Pack of 6 | 120", "Regular". The part after | or a comma is the
 * MRP (optional). Unit and quantity are read from the label; anything we can't
 * read becomes 1 piece.
 */
export function parseSizeLine(line: string): CatalogSizeLine | null {
  const [rawLabel, rawMrp] = line.split(/\s*[|,]\s*(?=[₹\d.\s]*$)/);
  const label = (rawLabel ?? '').trim().slice(0, 40);
  if (!label) return null;
  const mrpText = (rawMrp ?? '').replace(/[₹\s]/g, '');
  const mrp = mrpText && Number.isFinite(Number(mrpText)) && Number(mrpText) > 0 ? Math.round(Number(mrpText) * 100) / 100 : null;

  let unit: ProductUnit = 'piece';
  let qty = 1;
  const m = label.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/i);
  const packOf = label.match(/(?:pack\s+of|set\s+of)\s*(\d+)/i);
  if (m) {
    const hit = UNIT_WORDS.find(([re]) => re.test(m[2]!));
    if (hit) {
      unit = hit[1];
      qty = Number(m[1]);
    }
  } else if (packOf) {
    qty = Number(packOf[1]);
  }
  return { label, unit, unit_quantity: qty > 0 ? qty : 1, mrp };
}

export const parseSizeLines = (text: string): CatalogSizeLine[] =>
  text
    .split('\n')
    .map(parseSizeLine)
    .filter((s): s is CatalogSizeLine => s !== null)
    .slice(0, 10);

export const formatSizeLine = (s: { label: string; mrp?: number | null }) => (s.mrp ? `${s.label} | ${s.mrp}` : s.label);
