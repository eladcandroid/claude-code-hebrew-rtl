import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const draft = atom({ plugin: 'hebrew-rtl', key: 'draft' } as const, '')

// Model of cmux/Ghostty, from screenshots: it draws each run of Hebrew
// (Hebrew letters plus the spaces/punctuation between them, same font)
// right-to-left by itself, but does no line-level bidi, and cell colors stay
// in place. So we lay out each row in visual order ourselves (simplified UBA,
// RTL paragraph), then pre-flip only those Hebrew runs, styles kept by cell.

const HEB = /[֐-׿יִ-ﭏ]/
const LAT = /[A-Za-zÀ-ɏ]/
const DIG = /[0-9]/
const FENCE = /^\s*(```|~~~)/
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }

type Kind = 'plain' | 'bold' | 'code'
type Cell = { c: string; k: Kind }
type Seg = { kind: 'rtl'; line: string } | { kind: 'md'; text: string }

const count = (t: string, re: RegExp) => Array.from(t).filter(c => re.test(c)).length
const isRtl = (t: string) => count(t, HEB) > 0 && count(t, HEB) >= count(t, LAT)

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

// Light inline markdown → styled cells.
export function toCells(raw: string, md: boolean): { cells: Cell[]; heading: boolean } {
  let line = raw.replace(/\t/g, '  ').trimEnd()
  let heading = false
  if (md) {
    line = line.trim()
    const h = /^#{1,6}\s+/.exec(line)
    if (h) { heading = true; line = line.slice(h[0].length) }
    line = line.replace(/^[-*+]\s+/, '• ').replace(/^(\d+)\.\s+/, '$1. ').replace(/^>\s?/, '│ ')
  }
  const cells: Cell[] = []
  const parts = md ? line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g) : [line]
  for (const p of parts) {
    if (!p) continue
    let k: Kind = 'plain'
    let t = p
    if (md && p.length > 4 && p.startsWith('**') && p.endsWith('**')) { k = 'bold'; t = p.slice(2, -2) }
    else if (md && p.length > 2 && p.startsWith('`') && p.endsWith('`')) { k = 'code'; t = p.slice(1, -1) }
    for (const c of Array.from(t)) cells.push({ c, k: heading ? 'bold' : k })
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

// Simplified Unicode bidi for an RTL paragraph: logical cells → visual (L→R).
export function visual(cells: Cell[]): Cell[] {
  const n = cells.length
  const t: ('R' | 'L' | 'EN' | 'N')[] = cells.map(({ c }) =>
    HEB.test(c) ? 'R' : DIG.test(c) ? 'EN' : LAT.test(c) || /\p{L}/u.test(c) ? 'L' : 'N',
  )
  // number separators between digits join the number
  for (let i = 1; i < n - 1; i++)
    if (t[i] === 'N' && /[.,:/\-]/.test(cells[i]!.c) && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN'
  // W7: digits after Latin act as Latin
  let last: 'R' | 'L' = 'R'
  for (let i = 0; i < n; i++) {
    if (t[i] === 'R' || t[i] === 'L') last = t[i] as 'R' | 'L'
    else if (t[i] === 'EN' && last === 'L') t[i] = 'L'
  }
  // neutrals: same strong on both sides (digits count as R), else R
  const strong = (x: string) => (x === 'L' ? 'L' : x === 'N' ? null : 'R')
  const lvl: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    if (t[i] !== 'N') { lvl[i] = t[i] === 'R' ? 1 : 2; continue }
    let a: string | null = 'R', b: string | null = 'R'
    for (let j = i - 1; j >= 0; j--) { const s = strong(t[j]!); if (s) { a = s; break } }
    for (let j = i + 1; j < n; j++) { const s = strong(t[j]!); if (s) { b = s; break } }
    lvl[i] = a === 'L' && b === 'L' ? 2 : 1
  }
  const idx = cells.map((_, i) => i)
  for (let L = 2; L >= 1; L--) {
    let i = 0
    while (i < n) {
      if (lvl[idx[i]!]! >= L) {
        let j = i
        while (j < n && lvl[idx[j]!]! >= L) j++
        idx.splice(i, j - i, ...idx.slice(i, j).reverse())
        i = j
      } else i++
    }
  }
  return idx.map(i => {
    const cell = cells[i]!
    const m = MIRROR[cell.c]
    return lvl[i] === 1 && m ? { ...cell, c: m } : cell
  })
}

// cmux/Ghostty (measured): each run from a Hebrew letter to a Hebrew letter,
// with spaces, punctuation and digits inside but no Latin, same font, is laid
// out RTL by the terminal (digit groups stay LTR, brackets mirrored). That op is
// its own inverse, so apply it to the visual row; cell styles stay put.
const NUM = /\d+(?:[.,:\/\-]\d+)*/g
export function forGhostty(v: Cell[]): Cell[] {
  const out = v.map(x => ({ ...x }))
  const font = (k: Kind) => (k === 'bold' ? 'b' : 'r')
  let i = 0
  while (i < v.length) {
    if (!HEB.test(v[i]!.c)) { i++; continue }
    let j = i, end = i
    while (j < v.length && !LAT.test(v[j]!.c) && font(v[j]!.k) === font(v[i]!.k)) { if (HEB.test(v[j]!.c)) end = j; j++ }
    const span = v.slice(i, end + 1).map(x => MIRROR[x.c] ?? x.c).reverse().join('')
    const fixed = Array.from(span.replace(NUM, d => Array.from(d).reverse().join('')))
    fixed.forEach((c, m) => (out[i + m]!.c = c))
    i = end + 1
  }
  return out
}

// Plain text → rows of strings ready for the terminal.
function rtlRows(text: string, width: number): string[] {
  const rows: string[] = []
  for (const line of text.split('\n')) {
    if (!isRtl(line)) { rows.push(line || ' '); continue }
    for (const row of wrap(toCells(line, false).cells, width))
      rows.push(forGhostty(visual(row)).map(x => x.c).join('') || ' ')
  }
  return rows
}

function groups(row: Cell[]): Cell[][] {
  const g: Cell[][] = []
  for (const cell of row) {
    const lastG = g[g.length - 1]
    if (lastG && lastG[0]!.k === cell.k) lastG.push(cell)
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
                    {groups(forGhostty(visual(row))).map((g, j) => {
                      const txt = g.map(x => x.c).join('')
                      return g[0]!.k === 'bold' ? (
                        <Text key={`g${j}`} bold>{txt}</Text>
                      ) : g[0]!.k === 'code' ? (
                        <Text key={`g${j}`} color="cyan">{txt}</Text>
                      ) : (
                        <Text key={`g${j}`}>{txt}</Text>
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
    const rows = rtlRows(p.text, width)
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
    const rows = rtlRows(text, Math.max(20, cols - 3)).slice(-6)
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
