import i18n from '@/lib/i18n';
import { parseIssue } from './api';

/** Translates a quote issue like 'insufficient_stock:<variant>' using the shared error messages. */
export function issueMessage(issue: string) {
  return i18n.t(`errors.${parseIssue(issue).code}`, { defaultValue: i18n.t('errors.generic') });
}

