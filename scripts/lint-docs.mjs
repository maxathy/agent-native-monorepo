#!/usr/bin/env node
/**
 * Structural lint for docs/prd and docs/adr.
 *
 * Context packs drift silently — this repo is the proof, having documented a TTL,
 * an HNSW index, and testcontainers that were never implemented. Prose can't be
 * checked mechanically, but structure can, and structure is where drift shows up
 * first: an id that resolves nowhere, a dependency that isn't mutual, a status in
 * the index that no longer matches the file.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prdDir = join(root, 'docs', 'prd');
const adrDir = join(root, 'docs', 'adr');

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const STATUSES = ['draft', 'accepted', 'in-progress', 'shipped', 'superseded'];
const SIZES = ['S', 'M', 'L'];
const REQUIRED = [
  'id',
  'title',
  'tier',
  'status',
  'size',
  'depends_on',
  'blocks',
  'issue',
  'superseded_by',
];

/** Minimal frontmatter reader. Handles scalars and inline arrays, which is all we use. */
function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let raw = line.slice(idx + 1).trim();
    raw = raw.replace(/\s+#.*$/, '').trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const inner = raw.slice(1, -1).trim();
      out[key] = inner ? inner.split(',').map((s) => s.trim()) : [];
    } else if (raw === 'null' || raw === '') {
      out[key] = null;
    } else {
      out[key] = raw;
    }
  }
  return out;
}

// --- PRD index is the registry of known ids -------------------------------
const prdIndexPath = join(prdDir, 'README.md');
if (!existsSync(prdIndexPath)) {
  fail('docs/prd/README.md', 'missing — the index is the source of truth for the backlog');
}
const prdIndex = new Map();
for (const line of readFileSync(prdIndexPath, 'utf-8').split('\n')) {
  const row = /^\|\s*(?:\[([^\]]+)\]\([^)]+\)|([A-Z]\d-[A-Z]))\s*\|(.+)\|\s*$/.exec(line);
  if (!row) continue;
  const id = row[1] ?? row[2];
  const cells = row[3].split('|').map((c) => c.trim());
  prdIndex.set(id, { status: cells[cells.length - 1], size: cells[cells.length - 2] });
}
if (prdIndex.size === 0) fail('docs/prd/README.md', 'no PRD rows parsed from the index tables');

// --- Each PRD file -------------------------------------------------------
const files = readdirSync(prdDir).filter(
  (f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md',
);
const byId = new Map();

for (const file of files) {
  const where = `docs/prd/${file}`;
  const fm = frontmatter(readFileSync(join(prdDir, file), 'utf-8'));
  if (!fm) {
    fail(where, 'no YAML frontmatter block');
    continue;
  }
  for (const key of REQUIRED) {
    if (!(key in fm)) fail(where, `frontmatter is missing \`${key}\``);
  }
  if (fm.status && !STATUSES.includes(fm.status))
    fail(where, `status \`${fm.status}\` is not one of ${STATUSES.join(', ')}`);
  if (fm.size && !SIZES.includes(fm.size))
    fail(where, `size \`${fm.size}\` is not one of ${SIZES.join(', ')}`);
  if (fm.id && !file.startsWith(`${fm.id}-`))
    fail(where, `filename does not start with its id \`${fm.id}\``);
  if (fm.id && !prdIndex.has(fm.id)) fail(where, `id \`${fm.id}\` is not listed in the index`);
  if (fm.id && prdIndex.has(fm.id)) {
    const row = prdIndex.get(fm.id);
    if (row.status !== fm.status)
      fail(where, `status \`${fm.status}\` disagrees with the index, which says \`${row.status}\``);
    if (row.size !== fm.size)
      fail(where, `size \`${fm.size}\` disagrees with the index, which says \`${row.size}\``);
  }
  if (fm.status === 'in-progress' && !fm.issue)
    fail(where, 'status is `in-progress` but no issue is recorded');
  if (fm.status === 'superseded' && !fm.superseded_by)
    fail(where, 'status is `superseded` but `superseded_by` is empty');
  if (fm.id) byId.set(fm.id, { fm, where });
}

// --- Referential integrity ------------------------------------------------
for (const [id, { fm, where }] of byId) {
  for (const key of ['depends_on', 'blocks']) {
    for (const ref of fm[key] ?? []) {
      if (!prdIndex.has(ref))
        fail(where, `${key} references \`${ref}\`, which is not in the index`);
    }
  }
  // Symmetry, checkable only where both files exist.
  for (const ref of fm.blocks ?? []) {
    const other = byId.get(ref);
    if (other && !(other.fm.depends_on ?? []).includes(id))
      fail(where, `blocks \`${ref}\`, but ${ref} does not list \`${id}\` in depends_on`);
  }
  for (const ref of fm.depends_on ?? []) {
    const other = byId.get(ref);
    if (other && !(other.fm.blocks ?? []).includes(id))
      fail(where, `depends_on \`${ref}\`, but ${ref} does not list \`${id}\` in blocks`);
  }
  if (fm.superseded_by && !prdIndex.has(fm.superseded_by))
    fail(where, `superseded_by references \`${fm.superseded_by}\`, which is not in the index`);
}

// --- ADRs -----------------------------------------------------------------
const adrIndexPath = join(adrDir, 'README.md');
if (existsSync(adrIndexPath)) {
  const indexed = new Set();
  for (const line of readFileSync(adrIndexPath, 'utf-8').split('\n')) {
    const row = /^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|/.exec(line);
    if (!row) continue;
    indexed.add(row[2]);
    if (!existsSync(join(adrDir, row[2])))
      fail('docs/adr/README.md', `index lists \`${row[2]}\`, which does not exist`);
  }
  for (const file of readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f))) {
    if (!indexed.has(file)) fail(`docs/adr/${file}`, 'exists but is not listed in the ADR index');
    const text = readFileSync(join(adrDir, file), 'utf-8');
    if (!/^\*\*Status:\*\*\s*(\S+)/m.test(text))
      fail(`docs/adr/${file}`, 'has no **Status:** line');
  }
} else {
  fail('docs/adr/README.md', 'missing');
}

// --- Report ---------------------------------------------------------------
if (errors.length) {
  console.error(`\ndocs lint failed with ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log(
  `docs lint passed: ${byId.size} PRD file(s), ${prdIndex.size} indexed, ADR index consistent.`,
);
