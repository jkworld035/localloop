import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@localloop/shared';
import { NOTIFICATION_TYPES } from '../../../../supabase/functions/_shared/notification-templates';
import en from './en.json';
import te from './te.json';

type Tree = { [k: string]: string | Tree };
const keys = (t: Tree, prefix = ''): string[] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
const get = (t: Tree, path: string) => path.split('.').reduce<string | Tree>((n, k) => (n as Tree)[k]!, t) as string;

describe('translations', () => {
  it('Telugu covers every English key (and no extras)', () => {
    expect(keys(te as Tree).sort()).toEqual(keys(en as Tree).sort());
  });
  it('uses the same interpolation variables in both languages', () => {
    for (const k of keys(en as Tree)) {
      expect(placeholders(get(te as Tree, k)), k).toEqual(placeholders(get(en as Tree, k)));
    }
  });
  it('has a message for every database error code', () => {
    for (const code of ERROR_CODES) expect(en.errors, code).toHaveProperty(code);
  });
  it('has an in-app line for every push notification type', () => {
    for (const type of NOTIFICATION_TYPES) expect(en.notifications, type).toHaveProperty(type);
  });
  it('defines every key the app code uses', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(f) && !f.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(join(__dirname, '..'));
    const all = new Set(keys(en as Tree));
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-z0-9_]+\.[a-z0-9_.]+)'/g)) used.add(m[1]!);
    const missing = [...used].filter((k) => !all.has(k) && !all.has(`${k}_one`));
    expect(missing).toEqual([]);
  });
});
