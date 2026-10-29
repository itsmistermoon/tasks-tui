import { test, expect } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { BoxRenderable, ScrollBoxRenderable, TextRenderable } from '@opentui/core'
import { selectTask } from './navigation'

test('keyboard selection preserves scroll and brings each task into view', async () => {
  const setup = await createTestRenderer({width: 50, height: 12})
  try {
    const sc = new ScrollBoxRenderable(setup.renderer, { id:'list', width:50, height:12 })
    setup.renderer.root.add(sc)
    for (let i=0;i<30;i++) {
      const task = new BoxRenderable(setup.renderer, { id:`task-${i}`, height:3, width:'100%' })
      const selection = new BoxRenderable(setup.renderer, { id:`selection-${i}`, width:'100%', shouldFill:false })
      selection.add(new TextRenderable(setup.renderer, { id:`title-${i}`, content:`Task ${i}`, width:'100%' }))
      task.add(selection)
      sc.add(task)
    }
    await setup.renderOnce()
    let prior = sc.scrollTop
    for(let i=1;i<25;i++) {
      selectTask(sc,i-1,i)
      await setup.renderOnce()
      expect(sc.scrollTop).toBeGreaterThanOrEqual(prior)
      const child=sc.getRenderable(`task-${i}`)!
      expect(child.y).toBeGreaterThanOrEqual(sc.viewport.y)
      expect(child.y+child.height).toBeLessThanOrEqual(sc.viewport.y+sc.viewport.height)
      prior=sc.scrollTop
    }
    expect(prior).toBeGreaterThan(0)
  } finally { await setup.dispose() }
})

test('selected task fills the full width including its origin', async () => {
  const setup = await createTestRenderer({width: 24, height: 8})
  try {
    const sc = new ScrollBoxRenderable(setup.renderer, {id:'list', width:24, height:8})
    setup.renderer.root.add(sc)
    for (let i=0;i<2;i++) {
      const task = new BoxRenderable(setup.renderer, {id:`task-${i}`, width:'100%', flexDirection:'column'})
      const selection = new BoxRenderable(setup.renderer, {id:`selection-${i}`, width:'100%', shouldFill:false})
      selection.add(new TextRenderable(setup.renderer, {id:`title-${i}`, content:i?'Long title wraps onto another line':'First', width:'100%', wrapMode:'word'}))
      selection.add(new TextRenderable(setup.renderer, {id:`origin-${i}`, content:'source', width:'100%'}))
      task.add(selection)
      sc.add(task)
    }
    await setup.renderOnce()
    selectTask(sc, 0, 1)
    await setup.renderOnce()
    const frame=setup.captureSpans()
    const lines=frame.lines.filter(line=>line.spans.some(span=>span.bg.toInts().slice(0,3).join(',')==='45,48,60'))
    expect(lines.length).toBe(3)
    for(const line of lines) expect(line.spans.filter(span=>span.bg.toInts().slice(0,3).join(',')==='45,48,60').reduce((n,span)=>n+span.width,0)).toBeGreaterThanOrEqual(20)
  } finally { await setup.dispose() }
})

test('home, end and page keys select the appropriate task', async () => {
  const { navigationTarget } = await import('./navigation')
  const setup=await createTestRenderer({width:40,height:10})
  try {
    const sc=new ScrollBoxRenderable(setup.renderer,{id:'list',width:40,height:10});setup.renderer.root.add(sc)
    for(let i=0;i<20;i++) sc.add(new BoxRenderable(setup.renderer,{id:`task-${i}`,height:3,width:'100%'}))
    await setup.renderOnce()
    expect(navigationTarget(sc,5,20,'home')).toBe(0)
    expect(navigationTarget(sc,5,20,'end')).toBe(19)
    expect(navigationTarget(sc,0,20,'pagedown')).toBeGreaterThan(1)
    expect(navigationTarget(sc,10,20,'pageup')).toBeLessThan(9)
  } finally {await setup.dispose()}
})

test('scrollbars are hidden while scrolling remains available', async () => {
  const { scrollbarOptions, hideScrollbars } = await import('./scrollbar')
  const setup = await createTestRenderer({width:20,height:6})
  try {
    const sc = hideScrollbars(new ScrollBoxRenderable(setup.renderer,{id:'list',width:20,height:6,scrollbarOptions}))
    setup.renderer.root.add(sc)
    for(let i=0;i<12;i++)sc.add(new TextRenderable(setup.renderer,{id:`line-${i}`,content:`Line ${i}`,height:1}))
    await setup.renderOnce()
    expect(sc.verticalScrollBar.visible).toBe(false)
    sc.scrollBy(3)
    expect(sc.scrollTop).toBeGreaterThan(0)
  } finally { await setup.dispose() }
})

test('panel borders follow focus and task status', async () => {
  const { overviewBorder, activeBorder, inactiveBorder, taskBorder, stateColors } = await import('./panel-theme')
  expect(overviewBorder('list','list','list')).toBe(activeBorder)
  expect(overviewBorder('browse','list','list')).toBe(inactiveBorder)
  expect(overviewBorder('browse','browse','list')).toBe(activeBorder)
  expect(overviewBorder('list','browse','list')).toBe(inactiveBorder)
  expect(overviewBorder('list','list','search')).toBe(inactiveBorder)
  for(const state of ['In progress','Queued','Blocked','Held','Done']) expect(taskBorder(state).equals(stateColors[state])).toBe(true)
})

test('browse navigation reaches the final row without resetting the viewport', async () => {
  const { selectBrowse } = await import('./navigation')
  const setup = await createTestRenderer({ width: 30, height: 8 })
  try {
    const sc = new ScrollBoxRenderable(setup.renderer, { id: 'browse', width: 30, height: 8 })
    setup.renderer.root.add(sc)
    const labels = Array.from({ length: 30 }, (_, i) => `repo ${i}`)
    labels.forEach((label, i) => { const row = new BoxRenderable(setup.renderer, {id: `nav-${i}`, width: '100%', height: 1, backgroundColor: '#a99cfa', shouldFill: false}); row.add(new TextRenderable(setup.renderer, { id: `nav-label-${i}`, content: `  ${label}`, height: 1 })); sc.add(row) })
    await setup.renderOnce()
    let previousTop = 0
    for (let i = 1; i < labels.length; i++) {
      selectBrowse(sc, i - 1, i, labels, 28, 0)
      await setup.renderOnce()
      expect(sc.scrollTop).toBeGreaterThanOrEqual(previousTop)
      previousTop = sc.scrollTop
    }
    const last = sc.getRenderable('nav-29')!
    expect(last.y).toBeLessThan(sc.viewport.y + sc.viewport.height)
    expect((sc.content.findDescendantById('nav-label-29') as TextRenderable).plainText).toContain('› repo 29')
    expect((last as BoxRenderable).shouldFill).toBe(false)
    expect((sc.getRenderable('nav-0') as BoxRenderable).shouldFill).toBe(true)
  } finally { await setup.dispose() }
})

test('browse page navigation crosses section headers and reaches both ends', async () => {
  const { navigationTarget } = await import('./navigation')
  const setup = await createTestRenderer({width: 30, height: 8})
  try {
    const sc = new ScrollBoxRenderable(setup.renderer, {id: 'browse-pages', width: 30, height: 8})
    setup.renderer.root.add(sc)
    for (let i = 0; i < 20; i++) {
      if (i === 5 || i === 12) sc.add(new TextRenderable(setup.renderer, {id: `heading-${i}`, content: 'section', height: 2}))
      sc.add(new TextRenderable(setup.renderer, {id: `nav-${i}`, content: `item ${i}`, height: 1}))
    }
    await setup.renderOnce()
    expect(navigationTarget(sc, 5, 20, 'home', 'nav')).toBe(0)
    expect(navigationTarget(sc, 5, 20, 'end', 'nav')).toBe(19)
    expect(navigationTarget(sc, 0, 20, 'pagedown', 'nav')).toBeGreaterThan(1)
    expect(navigationTarget(sc, 14, 20, 'pageup', 'nav')).toBeLessThan(13)
  } finally { await setup.dispose() }
})

test('restoring a rebuilt list reveals the task selected in the inspector', async () => {
  const { restoreTaskViewport } = await import('./navigation')
  const setup = await createTestRenderer({width: 40, height: 8})
  try {
    const sc = new ScrollBoxRenderable(setup.renderer, {id: 'inspected-list', width: 40, height: 8})
    setup.renderer.root.add(sc)
    for (let i = 0; i < 30; i++) sc.add(new BoxRenderable(setup.renderer, {id: `task-${i}`, height: 2, width: '100%'}))
    await setup.renderOnce()
    const offset = restoreTaskViewport(sc, 0, 25)
    await setup.renderOnce()
    const selected = sc.getRenderable('task-25')!
    expect(offset).toBeGreaterThan(0)
    expect(selected.y).toBeGreaterThanOrEqual(sc.viewport.y)
    expect(selected.y + selected.height).toBeLessThanOrEqual(sc.viewport.y + sc.viewport.height)
  } finally { await setup.dispose() }
})
