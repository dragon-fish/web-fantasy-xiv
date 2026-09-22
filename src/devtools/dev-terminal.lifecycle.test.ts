import { EventBus } from '@/core/event-bus'
import { CommandRegistry } from './commands'
import { DevTerminal } from './dev-terminal'

it('removes its DOM and keyboard listener on disposal', () => {
  const parent = document.createElement('div')
  const terminal = new DevTerminal(new EventBus(), new CommandRegistry())
  terminal.mount(parent)
  terminal.dispose()
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }))
  expect(terminal.isVisible()).toBe(false)
  expect(parent.children).toHaveLength(0)
})
