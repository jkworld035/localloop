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
});
