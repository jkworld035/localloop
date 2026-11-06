#!/usr/bin/env bash
# Applies every migration to a fresh PostgreSQL+PostGIS database and runs the
# pgTAP suites in supabase/tests. Works without the Supabase CLI or Docker:
#
#   PGHOST=/tmp PGPORT=54322 PGUSER=postgres bash scripts/test-db.sh
#
# With the Supabase CLI you can instead run: supabase db reset && supabase test db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB:-localloop_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/_supabase_stub.sql" >/dev/null

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
done
# Supabase grants service_role full table access by default.
"${PSQL[@]}" -d "$DB" -c "grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant usage on schema extensions to anon, authenticated, service_role;" >/dev/null
"${PSQL[@]}" -d "$DB" -c "create extension if not exists pgtap" >/dev/null

status=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  out="$("${PSQL[@]}" -d "$DB" -At -f "$t" 2>&1)" || true
  planned="$(grep -Eo '^1\.\.[0-9]+' <<<"$out" | head -1 | cut -c4-)"
  passed="$(grep -c '^ok' <<<"$out" || true)"
  # A script that stops early (psql error) must not count as a pass.
  if grep -Eq '^not ok|ERROR|Looks like' <<<"$out" || [ -z "$planned" ] || [ "$planned" != "$passed" ]; then
    echo "FAIL     $(basename "$t")"
    grep -E '^not ok|ERROR|#' <<<"$out" | sed 's/^/         /'
    status=1
  else
    echo "pass     $(basename "$t")  ($(grep -c '^ok' <<<"$out") assertions)"
  fi
done
exit $status
