import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const draft = atom({ plugin: 'hebrew-rtl', key: 'draft' } as const, '')

// How cmux/Ghostty draws a row (measured on screen): it runs the Unicode bidi
// algorithm with a left-to-right base over each row, but only Latin letters
// (and other strong-LTR characters such as U+2800) split it; spaces,
// punctuation, digits and emoji never do. Colors stay on their cell while
// glyphs move; bold moves with its glyph. There is no RTL paragraph handling.
//
// So for each row we compute the visual order an RTL paragraph should have
// (`visual`), then pick the string that the terminal's own pass turns into
// exactly that order (`forGhostty`).

const HEB = /[֐-׿יִ-ﭏ]/
const LAT = /[A-Za-zÀ-ɏ]/
const FENCE = /^\s*(```|~~~)/
const BLANK_L = '⠀' // looks like a space, but is strong LTR: cuts a terminal run
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }
const OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

export type Cell = { c: string; b?: boolean; code?: boolean; iso?: number }
type Seg = { kind: 'rtl'; line: string } | { kind: 'md'; text: string }
type BT = 'L' | 'R' | 'EN' | 'ES' | 'ET' | 'CS' | 'WS' | 'ON' | 'NI'

// Web addresses, e-mails and URL-like tokens (`?ref=x`, `a/b`) stay one
// left-to-right unit, even when they hold Hebrew.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]*[^\s<>"'`.,;:!?)\]]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const TOKEN_RE = /[^\s]+/g

const isRtl = (t: string) => {
  let h = 0, l = 0
  for (const w of t.replace(URL_RE, ' ').replace(/`[^`]*`/g, ' ').split(/\s+/)) {
    if (HEB.test(w)) h++
    else if (LAT.test(w)) l++
  }
  return h > 0 && h >= l
}

function segment(text: string): Seg[] {
  const out: Seg[] = []
  let buf: string[] = []
  let inFence = false
  const flush = () => {
    if (buf.some(l => l.trim())) out.push({ kind: 'md', text: buf.join('\n') })
    buf = []
  }
  for (const line of text.split('\n')) {
    const isFence = FENCE.test(line)
    if (isFence) inFence = !inFence
    if (!inFence && !isFence && !/^\s*\|/.test(line) && isRtl(line)) {
      flush()
      out.push({ kind: 'rtl', line })
    } else buf.push(line)
  }
  flush()
  return out
}

// Ranges [start, end) of text that should read as one LTR unit.
function isoRanges(t: string): [number, number][] {
  const r: [number, number][] = []
  for (const m of t.matchAll(URL_RE)) r.push([m.index!, m.index! + m[0].length])
  for (const m of t.matchAll(TOKEN_RE)) {
    let s = m.index!, e = s + m[0].length
    while (s < e && /[("'\[«]/.test(t[s]!)) s++
    while (e > s && /[)"'\].,;:!?»]/.test(t[e - 1]!)) e--
    const w = t.slice(s, e)
    if (!HEB.test(w) && LAT.test(w) && /[^/?=&@:#\\]/.test(w) && /.[/?=&@:#\\]./.test(w) || /^[?#][A-Za-z]/.test(w))
      if (!r.some(([a, b]) => s < b && e > a)) r.push([s, e])
  }
  return r
}

let isoSeq = 0
function plainCells(t: string, base: Omit<Cell, 'c'>, out: Cell[]) {
  const chars = Array.from(t)
  // isoRanges works in UTF-16 units; map them onto code points
  const ids: (number | undefined)[] = []
  let u = 0
  const ranges = isoRanges(t).map(([s, e]) => ({ s, e, id: ++isoSeq }))
  for (const ch of chars) {
    ids.push(ranges.find(r => u >= r.s && u < r.e)?.id)
    u += ch.length
  }
  chars.forEach((c, i) => out.push({ c, ...base, ...(ids[i] ? { iso: ids[i] } : {}) }))
}

// Light inline markdown → styled cells.
export function toCells(raw: string, md: boolean): { cells: Cell[]; heading: boolean } {
  let line = raw.replace(/\t/g, '  ').trimEnd()
  let heading = false
  if (md) {
    line = line.trim()
    const h = /^#{1,6}\s+/.exec(line)
    if (h) { heading = true; line = line.slice(h[0].length) }
    line = line
      .replace(/^[-*+]\s+/, '• ')
      .replace(/^(\d+)\.\s+/, '$1. ')
      .replace(/^>\s?/, '│ ')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt: string, url: string) => (txt === url ? url : `${txt} (${url})`))
  }
  const cells: Cell[] = []
  const parts = md ? line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g) : [line]
  for (const p of parts) {
    if (!p) continue
    if (md && p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
      plainCells(p.slice(2, -2), { b: true }, cells)
    } else if (md && p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
      const t = p.slice(1, -1)
      const iso = HEB.test(t) && !/[A-Za-z0-9]/.test(t) ? undefined : ++isoSeq
      for (const c of Array.from(t)) cells.push({ c, code: true, ...(heading ? { b: true } : {}), ...(iso ? { iso } : {}) })
    } else plainCells(p, heading ? { b: true } : {}, cells)
  }
  return { cells, heading }
}

// Word-wrap logical cells to rows of at most `w` cells.
export function wrap(cells: Cell[], w: number): Cell[][] {
  const rows: Cell[][] = []
  let row: Cell[] = []
  let word: Cell[] = []
  const pushWord = () => {
    if (!word.length) return
    if (row.length + word.length > w && row.length) {
      while (row.length && row[row.length - 1]!.c === ' ') row.pop()
      rows.push(row)
      row = []
    }
    while (word.length > w) { rows.push(word.slice(0, w)); word = word.slice(w) }
    row.push(...word)
    word = []
  }
  for (const cell of cells) {
    if (cell.c === ' ') { pushWord(); if (row.length) row.push(cell) }
    else word.push(cell)
  }
  pushWord()
  if (row.length || !rows.length) rows.push(row)
  return rows
}

// ---- Unicode bidi (UAX #9), the parts that matter here ----

export function btype(c: string): BT {
  if (HEB.test(c)) return 'R'
  if (c >= '0' && c <= '9') return 'EN'
  if (c === '+' || c === '-') return 'ES'
  if (/[#$%°¢£¤¥₪€‰‱±]/.test(c)) return 'ET'
  if (/[,.\/: ]/.test(c)) return 'CS'
  if (c === ' ') return 'WS'
  if (/[⠀-⣿]/.test(c) || /\p{L}/u.test(c)) return 'L'
  return 'ON'
}

const strongOf = (x: string) => (x === 'L' ? 'L' : x === 'R' || x === 'EN' ? 'R' : null)

// Embedding levels for one paragraph-level run (base 0 = LTR, 1 = RTL).
export function levels(cs: string[], types: BT[], base: 0 | 1): number[] {
  const n = cs.length
  const t: string[] = types.slice()
  const e = base ? 'R' : 'L'
  for (let i = 1; i < n - 1; i++) // W4
    if ((t[i] === 'ES' || t[i] === 'CS') && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN'
  for (let i = 0; i < n; i++) { // W5
    if (t[i] !== 'ET') continue
    let j = i
    while (j < n && t[j] === 'ET') j++
    if ((i > 0 && t[i - 1] === 'EN') || (j < n && t[j] === 'EN')) for (let k = i; k < j; k++) t[k] = 'EN'
    i = j - 1
  }
  for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS') t[i] = 'ON' // W6
  let last = e
  for (let i = 0; i < n; i++) { // W7
    if (t[i] === 'L' || t[i] === 'R') last = t[i]!
    else if (t[i] === 'EN' && last === 'L') t[i] = 'L'
  }
  // N0: bracket pairs
  const stack: { c: string; i: number }[] = []
  const pairs: [number, number][] = []
  for (let i = 0; i < n; i++) {
    if (t[i] !== 'ON') continue
    const c = cs[i]!
    if (c === '(' || c === '[' || c === '{') { if (stack.length < 63) stack.push({ c, i }) }
    else if (OPEN[c]) {
      const k = stack.map(s => s.c).lastIndexOf(OPEN[c]!)
      if (k >= 0) { pairs.push([stack[k]!.i, i]); stack.length = k }
    }
  }
  pairs.sort((a, b) => a[0] - b[0])
  for (const [o, c] of pairs) {
    let found: string | null = null
    for (let k = o + 1; k < c; k++) {
      const s = strongOf(t[k]!)
      if (s === e) { found = e; break }
      if (s) found = s
    }
    if (!found) continue
    let dir = e
    if (found !== e) {
      let ctx = e
      for (let k = o - 1; k >= 0; k--) { const s = strongOf(t[k]!); if (s) { ctx = s; break } }
      dir = ctx === found ? found : e
    }
    t[o] = t[c] = dir
  }
  // N1/N2
  const neutral = (x: string) => x === 'WS' || x === 'ON' || x === 'NI'
  for (let i = 0; i < n; i++) {
    if (!neutral(t[i]!)) continue
    let j = i
    while (j < n && neutral(t[j]!)) j++
    const a = i > 0 ? strongOf(t[i - 1]!) : e
    const b = j < n ? strongOf(t[j]!) : e
    const dir = a === b ? a! : e
    for (let k = i; k < j; k++) t[k] = dir
    i = j - 1
  }
  const lv = t.map(x => (base ? (x === 'R' ? 1 : 2) : x === 'R' ? 1 : x === 'EN' ? 2 : 0))
  // L1: trailing spaces go to the base level
  for (let i = n - 1; i >= 0 && types[i] === 'WS'; i--) lv[i] = base
  return lv
}

// L2: visual order (indices, left to right) from levels.
export function reorder(lv: number[]): number[] {
  const idx = lv.map((_, i) => i)
  const max = Math.max(0, ...lv)
  for (let L = max; L >= 1; L--) {
    let i = 0
    while (i < idx.length) {
      if (lv[idx[i]!]! < L) { i++; continue }
      let j = i
      while (j < idx.length && lv[idx[j]!]! >= L) j++
      idx.splice(i, j - i, ...idx.slice(i, j).reverse())
      i = j
    }
  }
  return idx
}

const mirror = (cell: Cell, odd: boolean): Cell => (odd && MIRROR[cell.c] ? { ...cell, c: MIRROR[cell.c]! } : cell)

// Logical cells of one row → visual order (left to right) for an RTL paragraph.
// Isolated units (URLs, code) are resolved LTR inside and act as neutral outside.
export function visual(cells: Cell[]): Cell[] {
  const cs = cells.map(x => x.c)
  // "←" between words is how RTL text writes a path or sequence; let it split
  // LTR runs so "ב-A ← B ← C" reads right to left.
  const lv = levels(cs, cells.map(x => (x.iso ? 'NI' : x.c === '←' ? 'R' : btype(x.c))), 1)
  for (let i = 0; i < cells.length; ) {
    const id = cells[i]!.iso
    if (!id) { i++; continue }
    let j = i
    while (j < cells.length && cells[j]!.iso === id) j++
    const part = cs.slice(i, j)
    // URL separators keep path segments in order: /הרשמה/טופס/ not /טופס/הרשמה/
    levels(part, part.map(c => (/[/?&=#]/.test(c) ? 'L' : btype(c))), 0).forEach((l, k) => (lv[i + k] = l + 2))
    i = j
  }
  return reorder(lv).map(i => mirror(cells[i]!, lv[i]! % 2 === 1))
}

// What the terminal does to a row (see top): UBA, LTR base, whole row.
// Glyphs and bold move; the code color stays on its cell.
export function terminal(row: Cell[]): Cell[] {
  const lv = levels(row.map(x => x.c), row.map(x => btype(x.c)), 0)
  return reorder(lv).map((i, q) => ({ ...mirror(row[i]!, lv[i]! % 2 === 1), code: row[q]!.code }))
}

// The row to print so that `terminal(row)` shows `v`. Between strong-LTR
// characters, the terminal reverses the stretch from the first to the last
// Hebrew letter (digit groups kept) — its own inverse, so we pre-reverse it.
// Digits right of the last Hebrew letter would get pulled into that stretch,
// so the space before them becomes U+2800, which cuts the run.
export function forGhostty(v: Cell[]): Cell[] {
  const out: Cell[] = v.map(x => ({ ...x }))
  const n = v.length
  let s = 0
  while (s < n) {
    let e = s
    while (e < n && btype(v[e]!.c) !== 'L') e++
    let a = -1, b = -1
    for (let k = s; k < e; k++) if (btype(v[k]!.c) === 'R') { if (a < 0) a = k; b = k }
    if (a >= 0) {
      // units: digit groups (as the bidi W4/W5 rules join them) or single cells
      const span = v.slice(a, b + 1)
      const lv = levels(span.map(x => x.c), span.map(x => btype(x.c)), 0)
      const units: Cell[][] = []
      span.forEach((cell, k) => {
        const prev = units[units.length - 1]
        if (lv[k] === 2 && prev && lv[k - 1] === 2) prev.push(cell)
        else units.push([cell])
      })
      const flipped = units.reverse().flatMap(u => (u.length > 1 ? u : u.map(x => mirror(x, true))))
      flipped.forEach((cell, k) => (out[a + k] = { ...cell, code: v[a + k]!.code }))
      // digits after the last Hebrew letter
      let d = b + 1
      while (d < e && btype(v[d]!.c) !== 'EN') d++
      if (d < e) {
        for (let k = d - 1; k > b; k--) if (v[k]!.c === ' ') { out[k] = { ...out[k]!, c: BLANK_L }; break }
      }
    }
    s = e + 1
  }
  return out
}

const layout = (row: Cell[]) => forGhostty(visual(row))

// Plain text → rows of cells ready for the terminal.
function rtlRows(text: string, width: number): Cell[][] {
  const rows: Cell[][] = []
  for (const line of text.split('\n')) {
    if (!isRtl(line)) { rows.push(Array.from(line || ' ').map(c => ({ c }))); continue }
    for (const row of wrap(toCells(line, false).cells, width)) rows.push(row.length ? layout(row) : [{ c: ' ' }])
  }
  return rows
}

function groups(row: Cell[]): Cell[][] {
  const g: Cell[][] = []
  for (const cell of row) {
    const lastG = g[g.length - 1]
    if (lastG && !!lastG[0]!.b === !!cell.b && !!lastG[0]!.code === !!cell.code) lastG.push(cell)
    else g.push([cell])
  }
  return g
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (!HEB.test(e.props.text) || e.props.isSummary) return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 4)
    return (
      <Box flexDirection="column" width="100%">
        {segment(e.props.text).map((s, i) => {
          if (s.kind === 'md') return <Markdown key={`m${i}`} text={s.text} />
          const { cells } = toCells(s.line, true)
          return (
            <Box key={`r${i}`} flexDirection="column" width="100%">
              {wrap(cells, width).map((row, r) => (
                <Box key={`w${r}`} width="100%" justifyContent="flex-end">
                  <Text wrap="truncate-end">
                    {groups(layout(row)).map((g, j) => {
                      const txt = g.map(x => x.c).join('')
                      const bold = !!g[0]!.b
                      return g[0]!.code ? (
                        <Text key={`g${j}`} bold={bold} color="cyan">{txt}</Text>
                      ) : (
                        <Text key={`g${j}`} bold={bold}>{txt}</Text>
                      )
                    })}
                  </Text>
                </Box>
              ))}
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const p = e.props
    if (!HEB.test(p.text) || p.task || p.from || !p.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 6)
    const rows = rtlRows(p.text, width).map(r => r.map(x => x.c).join(''))
    return (
      <Box flexDirection="row" width="100%">
        <Box flexGrow={1} flexDirection="column">
          {rows.map((r, i) => (
            <Box key={`u${i}`} width="100%" justifyContent="flex-end">
              <Text wrap="truncate-end">{r}</Text>
            </Box>
          ))}
        </Box>
        <Text dimColor> ❮</Text>
      </Box>
    )
  })

  // Live RTL preview of the draft in the band above the prompt box.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    await update($, draft, () => r.text)
    return r
  })
  on('prompt.change', async ($, e, next) => {
    await update($, draft, () => e.text)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    await update($, draft, () => '')
    return next(e)
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, draft)
    if (e.props.hasSurvey || !HEB.test(text)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const cols = (e.props as { bodyColumns?: number }).bodyColumns ?? e.viewport?.columns ?? 80
    const rows = rtlRows(text, Math.max(20, cols - 3)).slice(-6).map(r => r.map(x => x.c).join(''))
    return (
      <Box flexDirection="row" width="100%">
        <Box flexGrow={1} flexDirection="column">
          {rows.map((r, i) => (
            <Box key={`d${i}`} width="100%" justifyContent="flex-end">
              <Text wrap="truncate-end" color="cyan">{r}</Text>
            </Box>
          ))}
        </Box>
        <Text dimColor> ✎</Text>
      </Box>
    )
  })

  // Keep the preview as the band's last row, right above the prompt box.
  on('ui.render', { component: 'AbovePromptList' }, ($, e, next) => {
    const rows = e.props.rows
    const mine = rows.filter(r => r.plugin === 'hebrew-rtl')
    if (!mine.length) return next(e)
    return next({ ...e, props: { ...e.props, rows: [...rows.filter(r => r.plugin !== 'hebrew-rtl'), ...mine] } })
  })
}
