import { expect, test } from 'claude-code/testing'

// Expected strings were checked on screen in cmux (Ghostty): they read correctly RTL.
const reply = (text: string) => ({
  plugin: 'hebrew-rtl',
  surface: 'terminal',
  component: 'AssistantMessage',
  props: { text, isFirstOfReply: true },
}) as const

test('mixed Hebrew/English line laid out for cmux', async $ => {
  const ui = await $.ui.mount(reply('אבג XY דהו.'))
  expect(await ui.find({ text: '.דהו XY אבג' })).toBeDefined()
  await ui.unmount()
})

test('digits stay inside the Hebrew run', async $ => {
  const ui = await $.ui.mount(reply('גרסה 0.2.0, והבדיקות.'))
  expect(await ui.find({ text: '.גרסה 0.2.0, והבדיקות' })).toBeDefined()
  await ui.unmount()
})

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
