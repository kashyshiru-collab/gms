from pathlib import Path
import re

root = Path('supabase/migrations')
out = Path('supabase/full_schema.sql')
files = sorted(root.glob('*.sql'))

policy_re = re.compile(
    r'CREATE\s+POLICY\s+"(?P<name>[^"]+)"\s+ON\s+public\.(?P<table>[a-zA-Z0-9_]+)\s+FOR\s+[\s\S]*?;',
    re.IGNORECASE,
)
trigger_re = re.compile(
    r'CREATE\s+TRIGGER\s+(?P<name>[a-zA-Z0-9_]+)\s+(?P<body>[\s\S]*?ON\s+(?P<table>[a-zA-Z0-9_\.]+)\s+FOR\s+[\s\S]*?;)',
    re.IGNORECASE,
)
type_re = re.compile(
    r'CREATE\s+TYPE\s+public\.app_role\s+AS\s+ENUM\s*\([\s\S]*?\);',
    re.IGNORECASE,
)

trigger_block_re = re.compile(
    r'(?ims)^\s*(?P<drop>DROP\s+TRIGGER\s+IF\s+EXISTS\s+(?P<name>[a-zA-Z0-9_]+)\s+ON\s+(?P<table>[a-zA-Z0-9_\.]+)\s*;\s*\r?\n)?(?P<create>CREATE\s+TRIGGER\s+(?P=name)\b[\s\S]*?;)',
    re.IGNORECASE,
)


def find_ranges(text, start_token, end_token):
    ranges = []
    start = 0
    while True:
        begin = text.find(start_token, start)
        if begin == -1:
            break
        end = text.find(end_token, begin)
        if end == -1:
            break
        ranges.append((begin, end + len(end_token)))
        start = end + len(end_token)
    return ranges


def in_ranges(position, ranges):
    return any(start <= position < end for start, end in ranges)


def wrap_policy(match, do_ranges):
    if in_ranges(match.start(), do_ranges):
        return match.group(0)
    name = match.group('name')
    table = match.group('table')
    text = match.group(0)
    return (
        'DO $$ BEGIN\n'
        '  IF NOT EXISTS (\n'
        '    SELECT 1 FROM pg_policies p\n'
        '    JOIN pg_class c ON p.polrelid = c.oid\n'
        '    JOIN pg_namespace n ON c.relnamespace = n.oid\n'
        f"    WHERE p.polname = '{name}'\n"
        "      AND n.nspname = 'public'\n"
        f"      AND c.relname = '{table}'\n"
        '  ) THEN\n'
        f"    {text}\n"
        '  END IF;\n'
        'END $$;'
    )


def wrap_type(match, do_ranges):
    if in_ranges(match.start(), do_ranges):
        return match.group(0)
    text = match.group(0)
    return (
        'DO $$ BEGIN\n'
        '  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid '
        "WHERE n.nspname = 'public' AND t.typname = 'app_role') THEN\n"
        f"    {text}\n"
        '  END IF;\n'
        'END $$;'
    )


def wrap_trigger(match, do_ranges):
    if in_ranges(match.start(), do_ranges):
        return match.group(0)
    name = match.group('name')
    table = match.group('table')
    text = match.group(0)
    return f"DROP TRIGGER IF EXISTS {name} ON {table};\n{text}"


def remove_drop_trigger_before_create(content):
    return re.sub(
        r'(?im)^\s*DROP\s+TRIGGER\s+IF\s+EXISTS\s+(?P<name>[a-zA-Z0-9_]+)\s+ON\s+(?P<table>[a-zA-Z0-9_\.]+)\s*;\s*\r?\n(?=\s*CREATE\s+TRIGGER\s+(?P=name)\b)',
        '',
        content,
    )


def dedupe_adjacent_duplicate_lines(text):
    lines = text.splitlines()
    output_lines = []
    previous_line = None
    for line in lines:
        if previous_line is not None and line == previous_line and line.strip():
            continue
        output_lines.append(line)
        previous_line = line
    return '\n'.join(output_lines)


def remove_duplicate_trigger_blocks(text):
    matches = list(trigger_block_re.finditer(text))
    seen = set()
    for match in reversed(matches):
        name = match.group('name')
        if name in seen:
            start, end = match.span()
            text = text[:start].rstrip() + '\n' + text[end:].lstrip()
        else:
            seen.add(name)
    return text


def normalize_content(content):
    content = re.sub(
        r'CREATE\s+TABLE\s+public\.([a-zA-Z0-9_]+)\s*\(',
        r'CREATE TABLE IF NOT EXISTS public.\1 (',
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r'CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)([a-zA-Z0-9_]+)\s+ON\s+',
        r'CREATE UNIQUE INDEX IF NOT EXISTS \1 ON ',
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r'CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)([a-zA-Z0-9_]+)\s+ON\s+',
        r'CREATE INDEX IF NOT EXISTS \1 ON ',
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r'IF\s+NOT\s+EXISTS\s*\(\s*\n\s*SELECT\s+1\s*\n\s*FROM\s+pg_publication\s+p\s*\n\s*JOIN\s+pg_publication_rel\s+r\s+ON\s+p\.oid\s*=\s*r\.prpubid',
        r"IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')\n  AND NOT EXISTS (\n    SELECT 1\n    FROM pg_publication p\n    JOIN pg_publication_rel r ON p.oid = r.prpubid",
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r'CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_cron\s*;\s*\n\s*\nDO\s+\$\$\s+BEGIN\s*\n\s*IF\s+EXISTS\s*\(SELECT\s+1\s+FROM\s+cron\.job\s+WHERE\s+jobname\s*=\s*\'seed-activity-events\'\)\s+THEN\s*\n\s*PERFORM\s+cron\.unschedule\(\s*\'seed-activity-events\'\s*\);\s*\n\s*END\s+IF;\s*\nEND\s+\$\$;\s*\n\s*\nSELECT\s+cron\.schedule\(\s*\'seed-activity-events\'\s*,\s*\'\*\s+\*\s+\*\s+\*\s+\*\'\s*,\s*\$\$SELECT\s+public\.seed_activity_event\(\);\$\$\s*\);',
        """DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available; skipping activity event schedule';
END $$;

DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seed-activity-events') THEN
        PERFORM cron.unschedule('seed-activity-events');
      END IF;
      PERFORM cron.schedule('seed-activity-events', '* * * * *', 'SELECT public.seed_activity_event();');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
    END;
  END IF;
END $$;""",
        content,
        flags=re.IGNORECASE,
    )
    content = remove_drop_trigger_before_create(content)
    do_ranges = find_ranges(content, 'DO $$ BEGIN', 'END $$;')
    content = policy_re.sub(lambda m: wrap_policy(m, do_ranges), content)
    content = type_re.sub(lambda m: wrap_type(m, do_ranges), content)
    content = trigger_re.sub(lambda m: wrap_trigger(m, do_ranges), content)
    return content

all_parts = []
for path in files:
    raw_sql = path.read_text(encoding='utf-8')
    normalized_sql = normalize_content(raw_sql).strip()
    all_parts.append(f"-- === FILE: {path.name} ===\n{normalized_sql}\n")

full_text = '\n\n'.join(all_parts)
full_text = dedupe_adjacent_duplicate_lines(full_text)
full_text = remove_duplicate_trigger_blocks(full_text)
out.write_text(full_text.strip() + '\n', encoding='utf-8')
print(f'Wrote {out}')
