import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

import { runInNewContext } from 'node:vm'
import { expect, test, vi } from 'vitest'

const script = new URL('../scripts/example/response.js', import.meta.url)
const fixture = readFileSync(
  new URL('../fixtures/example/response.json', import.meta.url),
  'utf8',
)

function execute(body) {
  const done = vi.fn()
  const response = Object.freeze({ body })
  const context = { $response: response, $done: done }
  runInNewContext(readFileSync(script, 'utf8'), context)
  expect(done).toHaveBeenCalledTimes(1)
  return { done, transform: context.removeMockPromotion }
}

test('删除模拟广告字段并保留业务数据', () => {
  const { done } = execute(fixture)
  expect(JSON.parse(done.mock.calls[0][0].body)).toEqual({
    items: [{ id: 1, title: '示例内容' }],
    nextPage: null,
  })
})

test.each([
  ['字段不存在', '{ "items": [] }'],
  ['非法 JSON', '{'],
  ['空响应', ''],
  ['正文不可用', undefined],
  ['根结构改变', '[]'],
  ['字段类型改变', '{"mockPromotion":"unexpected"}'],
  ['广告标记改变', '{"mockPromotion":{"kind":"content"}}'],
])('%s时直接放行', (_description, body) => {
  expect(execute(body).done).toHaveBeenCalledWith({})
})

test('纯转换保留原始输入对象', () => {
  const input = Object.freeze(JSON.parse(fixture))
  const output = execute(fixture).transform(input)
  expect(output).not.toBe(input)
  expect(output.items).toBe(input.items)
  expect(input.mockPromotion).toEqual({ kind: 'ad' })
})
