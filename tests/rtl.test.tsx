import { expect, test } from 'claude-code/testing'

// Expected strings were checked on screen in cmux (Ghostty): they read correctly RTL.
// U+2800 (looks like a space) stops the terminal pulling a leading number into the Hebrew run.
const reply = (text: string) => ({
  plugin: 'hebrew-rtl',
  surface: 'terminal',
  component: 'AssistantMessage',
  props: { text, isFirstOfReply: true },
}) as const

const shows = async ($: Parameters<Parameters<typeof test>[1]>[0], text: string, want: string) => {
  const ui = await $.ui.mount(reply(text))
  expect(await ui.find({ text: want })).toBeDefined()
  await ui.unmount()
}

test('mixed Hebrew/English line laid out for cmux', $ => shows($, 'אבג XY דהו.', '.דהו XY אבג'))
test('digits stay inside the Hebrew run', $ => shows($, 'גרסה 0.2.0, והבדיקות.', '.גרסה 0.2.0, והבדיקות'))
test('numbered list item keeps its number on the right', $ => shows($, '1. שלב ראשון', 'שלב ראשון⠀.1'))
test('line starting with a number', $ => shows($, '**3 דרכים, מהפשוטה:**', ':דרכים, מהפשוטה⠀3'))
test('URL with Hebrew stays one LTR unit', $ =>
  shows($, 'הקישור: https://a.co.il/הרשמה?ref=x ואז', 'ואז https://a.co.il/הרשמה?ref=x :הקישור'))

test('English reply untouched', async $ => {
  const ui = await $.ui.mount(reply('hello world'))
  expect(await ui.find({ text: 'hello world' })).toBeUndefined()
  await ui.unmount()
})

test('Hebrew prompt laid out for cmux', async $ => {
  const ui = await $.ui.mount({
    plugin: 'hebrew-rtl',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'אבג 12 דהו XY זחט.', origin: { kind: 'composer' }, isExpanded: true },
  })
  expect(await ui.find({ text: '.זחט XY אבג 12 דהו' })).toBeDefined()
  await ui.unmount()
})
