import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'

const source = readFileSync(
  new URL('../scripts/zhihu/next-render.js', import.meta.url),
  'utf8',
)
const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/zhihu/next-render.json', import.meta.url),
    'utf8',
  ),
)

function execute(body) {
  const calls = []
  const context = {
    $response: Object.freeze({ body }),
    $done: (value) => calls.push(value),
  }
  runInNewContext(source, context)
  expect(calls).toHaveLength(1)
  return { result: calls[0], transform: context.filterZhihuAnswerFlow }
}

test('移除 SDK 广告位和完整素材卡片，保留回答、相关问题、未知条目及分页', () => {
  const output = JSON.parse(execute(JSON.stringify(fixture)).result.body)
  expect(output).toEqual({
    ...fixture,
    data: [fixture.data[0], fixture.data[2], fixture.data[3], fixture.data[5]],
  })
})

test.each([
  '',
  undefined,
  '{',
  'null',
  '[]',
  '3',
  '{"data":null}',
  '{"data":{}}',
  '{ "data": [] }',
  '{ "data": [{"type":"answer","ad_info":{"data":""}}] }',
])('异常或无广告正文原样放行：%s', (body) => {
  expect(execute(body).result).toEqual({})
})

test('严格匹配顶层 type，不误删含 ad_info、广告关键词或嵌套广告标记的其他条目', () => {
  const keep = [
    null,
    [],
    1,
    'ad',
    {},
    { type: 'AD' },
    { type: 'answer', ad_info: { data: 'unknown' } },
    { type: 'answer', content: '广告行业分析', nested: { type: 'ad' } },
    { type: 'feed_advert' },
    { type: 'unknown', adjson: '{}' },
  ]
  const input = {
    data: [...keep, { type: 'ad', adjson: '{' }],
    dataV1: [{ type: 'ad' }],
  }
  expect(JSON.parse(execute(JSON.stringify(input)).result.body)).toEqual({
    data: keep,
    dataV1: input.dataV1,
  })
})

test('全广告数组允许过滤为空，保持分页元数据', () => {
  const input = { data: [{ type: 'ad' }], paging: { is_end: false, totals: 1 } }
  expect(JSON.parse(execute(JSON.stringify(input)).result.body)).toEqual({
    data: [],
    paging: input.paging,
  })
})

test('纯转换不修改输入，保留正常条目引用，无变化时返回原对象', () => {
  const answer = Object.freeze({ type: 'answer' })
  const paging = Object.freeze({ is_end: false })
  const input = Object.freeze({
    data: Object.freeze([answer, Object.freeze({ type: 'ad' })]),
    paging,
  })
  const transform = execute('{}').transform
  const output = transform(input)
  expect(output).not.toBe(input)
  expect(output.data).toEqual([answer])
  expect(output.data[0]).toBe(answer)
  expect(output.paging).toBe(paging)
  expect(input.data).toHaveLength(2)
  const clean = Object.freeze({ data: Object.freeze([answer]) })
  expect(transform(clean)).toBe(clean)
})

test('模块精确绑定回答流接口并使用对应公开脚本地址', () => {
  const module = readFileSync(
    new URL('../modules/my-rules.sgmodule', import.meta.url),
    'utf8',
  )
  const line = module
    .split('\n')
    .find((line) => line.startsWith('zhihu-next-render = '))
  expect(line).toBeDefined()
  expect(line).toContain('type=http-response,')
  expect(line).toContain('requires-body=1,max-size=-1,')
  expect(line).toContain(
    'script-path=https://raw.githubusercontent.com/MaoqingW/shadowrocket-toolkit/refs/heads/main/scripts/zhihu/next-render.js',
  )
  const pattern = new RegExp(line.match(/pattern=(.*?),requires-body=/)[1])
  for (const suffix of ['', '?type=answer&scenes=recommend'])
    expect(pattern.test('https://api.zhihu.com/next-render' + suffix)).toBe(
      true,
    )
  for (const url of [
    'http://api.zhihu.com/next-render',
    'https://apiXzhihu.com/next-render',
    'https://api.zhihu.com.evil.example/next-render',
    'https://api.zhihu.com/next-render/extra',
    'https://api.zhihu.com/next-render-extra',
    'https://api.zhihu.com/topstory/recommend',
  ])
    expect(pattern.test(url)).toBe(false)
})
