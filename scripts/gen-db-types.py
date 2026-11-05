#!/usr/bin/env python3
"""Generate packages/shared/src/types/database.ts from a migrated database.

Produces the same `Database` shape as `supabase gen types typescript`, so the
two are interchangeable. Use this when the Supabase CLI/Docker isn't
available (CI, this repo's test harness):

    PGHOST=/tmp PGPORT=54322 PGUSER=postgres python3 scripts/gen-db-types.py localloop_test

With the CLI:  supabase gen types typescript --local > packages/shared/src/types/database.ts
"""
import json
import pathlib
import subprocess
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "localloop_test"
OUT = pathlib.Path(__file__).resolve().parent.parent / "packages/shared/src/types/database.ts"


def q(sql: str):
    out = subprocess.run(["psql", "-X", "-At", "-d", DB, "-c", f"select coalesce(json_agg(t), '[]') from ({sql}) t"],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


enums = q("""
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' group by t.typname order by t.typname""")
enum_names = {e["name"] for e in enums}

cols = q("""
  select c.table_name, c.column_name, c.ordinal_position, c.is_nullable = 'YES' as nullable,
         c.column_default is not null as has_default, c.is_identity = 'YES' as identity,
         c.is_generated = 'ALWAYS' as generated, c.data_type, c.udt_name
    from information_schema.columns c join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
   order by c.table_name, c.ordinal_position""")

fks = q("""
  select con.conname as name, rel.relname as table_name,
         array_agg(att.attname order by k.ord) as columns,
         frel.relname as ref_table, array_agg(fatt.attname order by k.ord) as ref_columns,
         exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique and i.indpred is null
                   and (i.indkey::int2[])::int2[] @> con.conkey and array_length(con.conkey,1) = i.indnkeyatts) as one_to_one
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid join pg_namespace n on n.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid join pg_namespace fn on fn.oid = frel.relnamespace
    cross join lateral unnest(con.conkey, con.confkey) with ordinality as k(attnum, fattnum, ord)
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    join pg_attribute fatt on fatt.attrelid = con.confrelid and fatt.attnum = k.fattnum
   where con.contype = 'f' and n.nspname = 'public' and fn.nspname = 'public'
   group by con.conname, rel.relname, frel.relname, con.conrelid, con.conkey
   order by rel.relname, con.conname""")

funcs = q("""
  select p.proname as name,
         coalesce(p.proargnames, '{}') as argnames,
         coalesce(p.proargmodes::text[], '{}') as argmodes,
         (select array_agg(format_type(t, null)) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t) as argtypes,
         p.pronargdefaults as ndefaults, p.pronargs as nargs,
         format_type(p.prorettype, null) as rettype, p.proretset as retset
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
     and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- skip extension functions
   order by p.proname""")

table_names = sorted({c["table_name"] for c in cols})


def ts_type(t: str) -> str:
    arr = t.endswith("[]")
    base = t[:-2] if arr else t
    base = base.replace("public.", "")
    if base in enum_names:
        s = f'Database["public"]["Enums"]["{base}"]'
    elif base in ("uuid", "text", "character varying", "character", "date", "time without time zone",
                  "timestamp with time zone", "timestamp without time zone", "interval", "tsvector", "bytea",
                  "extensions.geography", "geography", "int4range"):
        s = "string" if base not in ("extensions.geography", "geography") else "unknown"
    elif base in ("smallint", "integer", "bigint", "numeric", "real", "double precision"):
        s = "number"
    elif base == "boolean":
        s = "boolean"
    elif base in ("json", "jsonb"):
        s = "Json"
    elif base in table_names:
        s = f'Database["public"]["Tables"]["{base}"]["Row"]'
    elif base == "void":
        s = "undefined"
    else:
        s = "unknown"
    return f"({s})[]" if arr and "|" in s else (f"{s}[]" if arr else s)


def col_type(c) -> str:
    if c["data_type"] == "ARRAY":
        return ts_type(c["udt_name"].lstrip("_") + "[]")
    if c["data_type"] == "USER-DEFINED":
        return ts_type(c["udt_name"])
    return ts_type(c["data_type"])


lines = [
    "// AUTO-GENERATED by scripts/gen-db-types.py from the migrated schema. Do not edit by hand.",
    "// Regenerate after changing migrations (see docs/database.md).",
    "/* eslint-disable */",
    "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
    "",
    "export type Database = {",
    "  public: {",
    "    Tables: {",
]
for t in table_names:
    tc = [c for c in cols if c["table_name"] == t]
    lines.append(f"      {t}: {{")
    lines.append("        Row: {")
    for c in tc:
        lines.append(f"          {c['column_name']}: {col_type(c)}{' | null' if c['nullable'] else ''};")
    lines.append("        };")
    for kind in ("Insert", "Update"):
        lines.append(f"        {kind}: {{")
        for c in tc:
            if c["generated"]:
                lines.append(f"          {c['column_name']}?: never;")
                continue
            opt = kind == "Update" or c["nullable"] or c["has_default"] or c["identity"]
            lines.append(f"          {c['column_name']}{'?' if opt else ''}: {col_type(c)}{' | null' if c['nullable'] else ''};")
        lines.append("        };")
    rels = [f for f in fks if f["table_name"] == t]
    lines.append("        Relationships: [")
    for f in rels:
        lines.append("          {")
        lines.append(f'            foreignKeyName: "{f["name"]}";')
        lines.append(f"            columns: {json.dumps(f['columns'])};")
        lines.append(f"            isOneToOne: {'true' if f['one_to_one'] else 'false'};")
        lines.append(f'            referencedRelation: "{f["ref_table"]}";')
        lines.append(f"            referencedColumns: {json.dumps(f['ref_columns'])};")
        lines.append("          },")
    lines.append("        ];")
    lines.append("      };")
lines += ["    };", "    Views: { [_ in never]: never };", "    Functions: {"]

for fn in funcs:
    names, modes, types = fn["argnames"], fn["argmodes"], fn["argtypes"] or []
    if not modes:
        modes = ["i"] * len(types)
    in_args = [(names[i] if i < len(names) else f"arg{i}", types[i]) for i in range(len(types)) if modes[i] in ("i", "b")]
    out_cols = [(names[i], types[i]) for i in range(len(types)) if modes[i] == "t"]
    first_default = fn["nargs"] - fn["ndefaults"]
    args = "; ".join(f"{n}{'?' if i >= first_default else ''}: {ts_type(ty)}" for i, (n, ty) in enumerate(in_args))
    if out_cols:
        ret = "{ " + "; ".join(f"{n}: {ts_type(ty)}" for n, ty in out_cols) + " }[]"
    else:
        ret = ts_type(fn["rettype"]) + ("[]" if fn["retset"] else "")
    lines.append(f"      {fn['name']}: {{ Args: {{ {args} }}{';' if args else ''} Returns: {ret} }};"
                 if args else f"      {fn['name']}: {{ Args: Record<PropertyKey, never>; Returns: {ret} }};")
lines += ["    };", "    Enums: {"]
for e in enums:
    lines.append(f"      {e['name']}: " + " | ".join(json.dumps(l) for l in e["labels"]) + ";")
lines += ["    };", "    CompositeTypes: { [_ in never]: never };", "  };", "};", "",
          'type PublicSchema = Database["public"];',
          'export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];',
          'export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];',
          'export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];',
          'export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];',
          'export type RpcArgs<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Args"];',
          'export type RpcReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];',
          ""]
OUT.write_text("\n".join(lines))
print(f"wrote {OUT.relative_to(OUT.parents[4])}: {len(table_names)} tables, {len(funcs)} functions, {len(enums)} enums")
