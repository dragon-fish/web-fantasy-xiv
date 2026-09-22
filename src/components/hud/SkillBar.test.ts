import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import { useBattleStore } from '@/stores/battle'
import { SKILL_TRIGGER_KEY } from './skill-trigger-key'
import SkillBar from './SkillBar.vue'
import type { SkillDef } from '@/core/types'

it('keeps charged skills unobscured until all charges are spent', async () => {
  setActivePinia(createPinia())
  const battle = useBattleStore()
  const skill: SkillDef = { id: 'dash', name: 'Dash', type: 'ability', castTime: 0, cooldown: 12000, gcd: false, targetType: 'single', requiresTarget: false, range: 0, mpCost: 0 }
  battle.skillBarEntries = [{ key: 'Space', skill, charges: 1, maxCharges: 2, triggerIndex: 200 }]
  battle.cooldowns.set(skill.id, 6000)
  const trigger = vi.fn()
  const wrapper = mount(SkillBar, { global: { provide: { [SKILL_TRIGGER_KEY as symbol]: ref(trigger) } } })
  expect(wrapper.find('.slot-cd-overlay').exists()).toBe(false)
  expect(wrapper.find('.slot-charge-progress').exists()).toBe(true)
  expect(wrapper.find('.slot-cd-text').exists()).toBe(false)
  await wrapper.find('button').trigger('click')
  expect(trigger).toHaveBeenCalledWith(200)
  battle.skillBarEntries[0]!.charges = 0
  await nextTick()
  expect(wrapper.find('.slot-charge-progress').exists()).toBe(false)
  expect(wrapper.find('.slot-cd-overlay').exists()).toBe(true)
  expect(wrapper.find('.slot-cd-text').text()).toBe('6.0')
  battle.skillBarEntries = [{ key: '1', skill }]
  await nextTick()
  expect(wrapper.find('.slot-cd-overlay').exists()).toBe(true)
  wrapper.unmount()
})
