import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'

const source = readFileSync(
  new URL('../scripts/zhihu/question-feeds.js', import.meta.url),
  'utf8',
)

function execute(body) {
  const calls = []
  const context = {
    $response: Object.freeze({ body }),
    $done: (value) => calls.push(value),
  }
  runInNewContext(source, context)
  expect(calls).toHaveLength(1)
  return { result: calls[0], transform: context.filterZhihuQuestionFeeds }
}

test('清空 feeds 响应顶层 ad_info，保留回答条目、分页和会话数据', () => {
  const input = {
    data: [{ type: 'question_feed_card', target_type: 'answer' }],
    ad_info: { campaign: 'advertisement payload' },
    paging: { is_end: false, next: 'cursor' },
    session: { id: 'session' },
  }
  expect(JSON.parse(execute(JSON.stringify(input)).result.body)).toEqual({
    ...input,
    ad_info: null,
  })
})

test.each(['', undefined, '{', 'null', '[]', '{"data":[]}'])(
  '空、无效或无 ad_info 的响应原样放行：%s',
  (body) => {
    expect(execute(body).result).toEqual({})
  },
)

test('转换不修改输入，无 ad_info 时返回原对象', () => {
  const input = Object.freeze({
    data: Object.freeze([Object.freeze({ type: 'answer' })]),
    ad_info: Object.freeze({ content: 'ad' }),
  })
  const transform = execute('{}').transform
  const output = transform(input)
  expect(output).not.toBe(input)
  expect(output.ad_info).toBeNull()
  expect(output.data).toBe(input.data)
  expect(input.ad_info).toEqual({ content: 'ad' })

  const clean = Object.freeze({ data: Object.freeze([]) })
  expect(transform(clean)).toBe(clean)
})

test('模块精确绑定指定问题 feeds 路径族并使用对应脚本地址', () => {
  const module = readFileSync(
    new URL('../modules/my-rules.sgmodule', import.meta.url),
    'utf8',
  )
  const line = module
    .split('\n')
    .find((line) => line.startsWith('zhihu-question-feeds = '))
  expect(line).toBeDefined()
  expect(line).toContain('type=http-response,')
  expect(line).toContain('requires-body=1,max-size=-1,')
  expect(line).toContain(
    'script-path=https://raw.githubusercontent.com/MaoqingW/shadowrocket-toolkit/refs/heads/main/scripts/zhihu/question-feeds.js',
  )
  const pattern =
    /^https:\/\/api\.zhihu\.com\/questions\/[^/?#]+\/feeds(?:\?|$)/
  expect(
    pattern.test(
      'https://api.zhihu.com/questions/2106691940146331909/feeds?order=votenum',
    ),
  ).toBe(true)
  expect(line).toContain(
    'pattern=^https://api\\.zhihu\\.com/questions/[^/?#]+/feeds(?:\\?|$)',
  )
})
