# hebrew-rtl — Hebrew right-to-left for Claude Code

A [Claude Code](https://claude.com/claude-code) mod that makes Hebrew readable in the terminal CLI:

- **Replies**: lines that are mostly Hebrew are laid out right-to-left and aligned to the right, including lines that mix in English words, numbers, punctuation and parentheses. Numbered lists keep their number on the right, and web addresses, e-mails and `?key=value` tokens stay readable left-to-right even when they contain Hebrew. `**bold**` and `` `code` `` keep their styling. Code blocks, tables and English lines are left as they are.
- **Your messages**: Hebrew prompts in the transcript are shown right-to-left, aligned right, with a dim `❮` marker.
- **Live preview while typing**: the prompt box itself can't be redrawn by a mod, so while you type Hebrew a cyan preview row (`✎`) right above the prompt box shows your draft laid out correctly. It disappears when you send.

## Install

At the prompt of a terminal session:

```
/plugin install hebrew-rtl --marketplace eladcandroid/claude-code-hebrew-rtl
```

From a shell:

```
claude plugin install hebrew-rtl --marketplace eladcandroid/claude-code-hebrew-rtl
```

Start a new session after installing.

## Terminal support

| Terminal | Status | How it was checked |
| --- | --- | --- |
| cmux | ✅ Works | Live in Claude Code, plus test lines captured and zoomed on screen |
| iTerm2 (bidi setting on) | ✅ Works | Same test lines captured on screen; output identical to cmux |
| Apple Terminal | ✅ Works | Same test lines captured on screen; output identical to cmux |
| Ghostty | ❔ Probably works | Not tested. cmux is built on Ghostty, so it likely behaves the same |
| iTerm2 (bidi setting off) | ❔ Not tested | |
| VS Code / Cursor terminal | ❔ Not tested | |
| Others (WezTerm, Kitty, Warp, Windows Terminal, …) | ❔ Not tested | |

All three tested terminals behave the same way: they run the Unicode Bidirectional Algorithm over each row with a left-to-right base, split only by Latin letters (and other strong left-to-right characters), so a run of Hebrew with its spaces, punctuation and digits is drawn right-to-left, but the line as a whole is not reordered. Cell colors stay in place when glyphs move. The mod therefore:

1. word-wraps each Hebrew line itself to the terminal width,
2. computes the visual right-to-left order of the line (Unicode Bidirectional Algorithm, RTL paragraph, including bracket pairs; URLs and code are kept as left-to-right units),
3. picks the string that the terminal's own pass turns into exactly that order: each Hebrew run is pre-flipped, and where a number would otherwise be pulled into a Hebrew run (`1. ...` list items, lines that start with a number) the space before it is printed as U+2800, a blank cell that splits the run,
4. right-aligns the result.

Because the text is pre-arranged for the screen, copying a Hebrew reply out of the terminal gives the characters in display order.

A terminal that behaves differently may show Hebrew reversed. Reports (a screenshot of a Hebrew reply) and pull requests for other terminals are welcome.

## How it works

The mod hooks Claude Code's `ui.render` for `AssistantMessage`, `UserMessage` and `AbovePrompt`, plus `prompt.edit` / `prompt.change` / `prompt.submit` to track the draft for the preview. Only the drawing changes: stored messages and what the model sees are untouched. See `hooks/register.tsx`.

---

## בעברית

מוד ל-Claude Code שמציג עברית בטרמינל מימין לשמאל ומיושרת לימין:

- **תשובות**: שורות שרובן עברית מוצגות מימין לשמאל, גם כשיש בהן מילים באנגלית, מספרים, פיסוק וסוגריים. ברשימה ממוספרת המספר נשאר מימין, וכתובות אינטרנט ומיילים (גם עם עברית) נשארים קריאים משמאל לימין. הדגשה וקוד נשמרים. בלוקים של קוד, טבלאות ושורות באנגלית לא משתנים.
- **ההודעות שלך**: הודעה בעברית מוצגת מיושרת לימין.
- **תצוגה מקדימה בזמן הקלדה**: מוד לא יכול לשנות את תיבת ההקלדה עצמה, לכן מעליה מופיעה שורה בתכלת (`✎`) שמציגה את מה שאתה מקליד בסדר הנכון.

התקנה: הריצו בתוך Claude Code את הפקודה
`/plugin install hebrew-rtl --marketplace eladcandroid/claude-code-hebrew-rtl`
ופתחו סשן חדש.

נבדק ועובד ב-cmux, ב-iTerm2 (כשהגדרת ה-bidi פעילה) וב-Terminal של Apple. Ghostty, VS Code, Cursor וטרמינלים אחרים לא נבדקו, וייתכן שבהם העברית תתהפך.

## License

MIT
