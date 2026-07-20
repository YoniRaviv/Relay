#!/usr/bin/env node
// Regenerates shared/models.generated.json from Anthropic's public docs (no API key).
// Run by .github/workflows/update-models.yml on a weekly cron; also runnable locally.
//
// The docs table is column-oriented (models across the top, attributes down the side),
// so we transpose it: ids come from the "Claude API alias" row, labels from the header,
// pricing from the "Pricing" row.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = 'https://platform.claude.com/docs/en/about-claude/models/overview.md'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'models.generated.json')

function tables(md) {
    const groups = []
    let cur = []
    for (const line of md.split('\n')) {
        if (line.trimStart().startsWith('|')) cur.push(line)
        else { if (cur.length >= 3) groups.push(cur); cur = [] }
    }
    if (cur.length >= 3) groups.push(cur)
    return groups
}

function cells(row) {
    const p = row.split('|')
    p.shift(); p.pop()
    return p.map((s) => s.trim())
}

function tierOf(name) {
    const n = name.toLowerCase()
    if (n.includes('opus') || n.includes('fable') || n.includes('mythos')) return 'powerful'
    if (n.includes('haiku')) return 'fast'
    return 'balanced'
}

function priceOf(cell) {
    const m = /\$\s*([\d.]+)\s*\/\s*input MTok\s*\$\s*([\d.]+)\s*\/\s*output MTok/i.exec(cell || '')
    return m ? { inputPer1M: Number(m[1]), outputPer1M: Number(m[2]) } : { inputPer1M: null, outputPer1M: null }
}

function parseTable(rows) {
    const header = cells(rows[0])
    const byLabel = {}
    for (const r of rows.slice(2)) {
        const c = cells(r)
        const key = c[0].replace(/[*]/g, '').replace(/\d+$/, '').trim().toLowerCase()
        byLabel[key] = c
    }
    const aliasRow = byLabel['claude api alias'] || byLabel['claude api id']
    const priceRow = byLabel['pricing']
    if (!aliasRow) return []
    const models = []
    for (let j = 1; j < header.length; j++) {
        const name = header[j].replace(/[*]/g, '').trim()
        if (!name || name.toLowerCase() === 'feature') continue
        const id = (aliasRow[j] || '').replace(/\\/g, '').replace(/\s.*$/, '').trim()
        if (!/^claude-[a-z0-9-]+$/i.test(id)) continue
        const { inputPer1M, outputPer1M } = priceOf(priceRow?.[j])
        models.push({ id, label: name.replace(/^Claude\s+/, ''), tier: tierOf(name), inputPer1M, outputPer1M })
    }
    return models
}

const res = await fetch(SRC)
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
const md = await res.text()
const t = tables(md)
if (t.length === 0) throw new Error('No model tables found — docs format may have changed')

const current = parseTable(t[0])
const legacyRaw = t[1] ? parseTable(t[1]) : []
const currentIds = new Set(current.map((m) => m.id))
const legacy = legacyRaw.filter((m) => !currentIds.has(m.id))

if (current.length === 0) throw new Error('Parsed 0 current models — aborting to avoid clobbering the catalog')

const payload = { generatedAt: new Date().toISOString().slice(0, 10), source: SRC, current, legacy }
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n')
console.log(`Wrote ${current.length} current + ${legacy.length} legacy models to ${OUT}`)
