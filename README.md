# hebrew-rtl — Hebrew right-to-left for Claude Code

A [Claude Code](https://claude.com/claude-code) mod that makes Hebrew readable in the terminal CLI:

- **Replies**: lines that are mostly Hebrew are laid out right-to-left and aligned to the right, including lines that mix in English words, numbers, punctuation and parentheses. `**bold**` and `` `code` `` keep their styling. Code blocks, tables and English lines are left as they are.
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

All three tested terminals behave the same way: each run of Hebrew (Hebrew letters plus the spaces, punctuation and digits between them) is drawn right-to-left by the terminal itself, but a whole line that mixes Hebrew and English is not reordered, and cell colors stay in place when glyphs move. The mod therefore:

1. word-wraps each Hebrew line itself to the terminal width,
2. computes the visual right-to-left order of the line (a simplified Unicode Bidirectional Algorithm),
3. pre-flips every Hebrew run so the terminal's own flip puts it back in the right place, keeping each cell's color and weight where it belongs,
4. right-aligns the result.

A terminal that behaves differently may show Hebrew reversed. Reports (a screenshot of a Hebrew reply) and pull requests for other terminals are welcome.

## How it works

The mod hooks Claude Code's `ui.render` for `AssistantMessage`, `UserMessage` and `AbovePrompt`, plus `prompt.edit` / `prompt.change` / `prompt.submit` to track the draft for the preview. Only the drawing changes: stored messages and what the model sees are untouched. See `hooks/register.tsx`.

---

## בעברית

מוד ל-Claude Code שמציג עברית בטרמינל מימין לשמאל ומיושרת לימין:

- **תשובות**: שורות שרובן עברית מוצגות מימין לשמאל, גם כשיש בהן מילים באנגלית, מספרים, פיסוק וסוגריים. הדגשה וקוד נשמרים. בלוקים של קוד, טבלאות ושורות באנגלית לא משתנים.
- **ההודעות שלך**: הודעה בעברית מוצגת מיושרת לימין.
- **תצוגה מקדימה בזמן הקלדה**: מוד לא יכול לשנות את תיבת ההקלדה עצמה, לכן מעליה מופיעה שורה בתכלת (`✎`) שמציגה את מה שאתה מקליד בסדר הנכון.

התקנה: הריצו בתוך Claude Code את הפקודה
`/plugin install hebrew-rtl --marketplace eladcandroid/claude-code-hebrew-rtl`
ופתחו סשן חדש.

נבדק ועובד ב-cmux, ב-iTerm2 (כשהגדרת ה-bidi פעילה) וב-Terminal של Apple. Ghostty, VS Code, Cursor וטרמינלים אחרים לא נבדקו, וייתכן שבהם העברית תתהפך.

## License

MIT
