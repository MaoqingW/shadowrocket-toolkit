import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'

const script = new URL('../scripts/zhihu/recommend.js', import.meta.url)
const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/zhihu/recommend.json', import.meta.url),
    'utf8',
  ),
)

function execute(body) {
  const calls = []
  const context = { $response: { body }, $done: (value) => calls.push(value) }
  runInNewContext(readFileSync(script, 'utf8'), context)
  expect(calls).toHaveLength(1)
  return { result: calls[0], transform: context.filterZhihuRecommendation }
}

test('从两套推荐数组移除品牌广告和推广回答，保留顺序及分页', () => {
  const { result } = execute(JSON.stringify(fixture))
  const output = JSON.parse(result.body)
  for (const key of ['data', 'dataV1']) {
    expect(output[key].map((item) => item.id)).toEqual([
      'answer-a',
      'answer-b',
      'answer-c',
      'answer-d',
      'answer-e',
    ])
  }
  expect(output.paging).toEqual(fixture.paging)
  expect(output.styles).toEqual(fixture.styles)
  expect(output.extra).toEqual(fixture.extra)
})

test.each([
  { type: 'feed_advert' },
  {
    unify_content: {
      tags: [{ code: 'commercial_content_plugin_ad_tag', value: '广告' }],
    },
  },
  { unify_content: { rec: { source_type: 'TS_SOURCE_EXTRA_PROMOTION' } } },
  {
    extra: {
      promotion: {
        id: 'sample',
        is_card: true,
        impression_tracks: ['https://example.com/view'],
      },
    },
  },
  {
    unify_content: {
      biz_ext: {
        promotion:
          '{"id":"sample","is_card":true,"view_tracks":["https://example.com/view"]}',
      },
    },
  },
])('独立识别广告信号，不依赖另一套数组的下标：%j', (ad) => {
  const output = JSON.parse(
    execute(JSON.stringify({ dataV1: [null, ad, { id: 'keep' }] })).result.body,
  )
  expect(output).toEqual({ dataV1: [null, { id: 'keep' }] })
})

test('弱信号和畸形条目原样保留，即使同一页有广告', () => {
  const keep = [
    null,
    3,
    'ad',
    [],
    {},
    { type: 'answer', content: '广告行业分析' },
    { extra: { promotion: null } },
    { extra: { promotion: '{' } },
    { extra: { promotion: { id: 'sample', is_card: true, click_tracks: [] } } },
    {
      extra: {
        promotion: { id: 'sample', is_card: true, click_tracks: 'changed' },
      },
    },
    { unify_content: { tags: [null, '广告'], rec: [] } },
    {
      unify_content: {
        tags: { code: 'commercial_content_plugin_ad_tag', value: '广告' },
      },
    },
  ]
  const output = JSON.parse(
    execute(JSON.stringify({ data: [...keep, { type: 'feed_advert' }] })).result
      .body,
  )
  expect(output.data).toEqual(keep)
})

test.each([
  '',
  undefined,
  '{',
  'null',
  '[]',
  '3',
  '{ "data": [] }',
  '{"data":{},"dataV1":"changed"}',
  '{ "data": [{"type":"answer"}] }',
])('非法、未知或无广告响应不重新写入正文：%s', (body) => {
  expect(execute(body).result).toEqual({})
})

test('两套数组长度和位置不同时分别过滤，未知根字段保留', () => {
  const input = {
    data: [{ type: 'feed_advert' }],
    dataV1: [{ id: 'keep' }],
    other: [1],
  }
  expect(JSON.parse(execute(JSON.stringify(input)).result.body)).toEqual({
    data: [],
    dataV1: [{ id: 'keep' }],
    other: [1],
  })
})

test('不修改输入，未变更分支保留原引用', () => {
  const input = JSON.parse(JSON.stringify(fixture))
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
  }
  freeze(input)
  const transform = execute('{}').transform
  const output = transform(input)
  expect(input).toEqual(fixture)
  expect(output.data).toHaveLength(5)
  expect(output.data[0]).toBe(input.data[0])
  expect(output.paging).toBe(input.paging)
  const clean = Object.freeze({ data: Object.freeze([{ id: 'keep' }]) })
  expect(transform(clean)).toBe(clean)
})

test.each([
  { id: '', is_card: true, click_tracks: ['https://example.com/view'] },
  { id: ' ', is_card: true, click_tracks: ['https://example.com/view'] },
  { id: 0, is_card: true, click_tracks: ['https://example.com/view'] },
  { id: -1, is_card: true, click_tracks: ['https://example.com/view'] },
  { id: 'sample', is_card: 'true', click_tracks: ['https://example.com/view'] },
  { id: 'sample', is_card: true, click_tracks: [null, 1, {}, 'changed'] },
  'null',
  '[]',
])('推广证据不完整时保留条目：%j', (promotion) => {
  const keep = [
    { extra: { promotion } },
    { unify_content: { biz_ext: { promotion } } },
  ]
  const input = { data: [...keep, { type: 'feed_advert' }] }
  expect(JSON.parse(execute(JSON.stringify(input)).result.body).data).toEqual(
    keep,
  )
})

test('数值推广 ID 和混合跟踪数组可识别，两套数组分别处理', () => {
  const promotion = {
    id: 1,
    is_card: true,
    click_tracks: [null, 'https://example.com/view'],
  }
  const input = {
    data: [{ extra: { promotion } }, { id: 'keep-a' }],
    dataV1: [
      { id: 'keep-b' },
      { unify_content: { biz_ext: { promotion: JSON.stringify(promotion) } } },
    ],
  }
  expect(JSON.parse(execute(JSON.stringify(input)).result.body)).toEqual({
    data: [{ id: 'keep-a' }],
    dataV1: [{ id: 'keep-b' }],
  })
})

test('一套数组异常不影响另一套，未修改分支保留原引用', () => {
  const transform = execute('{}').transform
  const input = { data: { unknown: true }, dataV1: [{ type: 'feed_advert' }] }
  const output = transform(input)
  expect(output.data).toBe(input.data)
  expect(output.dataV1).toEqual([])
  const clean = { data: [{ id: 'keep' }], dataV1: [{ type: 'feed_advert' }] }
  expect(transform(clean).data).toBe(clean.data)
})
