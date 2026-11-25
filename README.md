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

The layout is tuned for **cmux / Ghostty**, measured on screen. These terminals lay out each run of Hebrew (Hebrew letters plus the spaces, punctuation and digits between them) right-to-left by themselves, but do not order a whole line that mixes Hebrew and English. They also leave cell colors in place when they move glyphs. The mod therefore:

1. word-wraps each Hebrew line itself to the terminal width,
2. computes the visual right-to-left order of the line (a simplified Unicode Bidirectional Algorithm),
3. pre-flips every Hebrew run so the terminal's own flip puts it back in the right place, keeping each cell's color and weight where it belongs,
4. right-aligns the result.

In terminals that handle Hebrew differently (for example iTerm2 with bidi turned on, or Apple Terminal), Hebrew may come out reversed. Issues and pull requests for other terminals are welcome.

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

המוד מותאם ל-cmux ול-Ghostty. בטרמינלים אחרים ייתכן שהעברית תתהפך.

## License

MIT
