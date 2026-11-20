import { createCipheriv, createDecipheriv } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync, gunzipSync } from 'node:zlib'
import { expect, test } from 'vitest'

const key = Buffer.from('e82ckenh8dichen8')
const root = 'https://interface3.music.163.com/eapi/link/home/framework/'
const fixture = {
  code: 200,
  data: {
    commonResourceList: [
      {
        title: '领福利',
        resCode: 'freeListen',
        url: 'orpheus://rnpage?component=rn-ad-free-music&isTheme=true',
      },
      { title: '心动', resCode: 'fastPlay' },
      { title: '推荐', resCode: 'rcmd', url: 'orpheus://nm/main/rcmd' },
      { title: '音乐', resCode: 'music' },
    ],
    topTabStyle: 'tab_try_expand',
  },
  message: '',
}

function encrypt(payload, compressed = true) {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  const json = Buffer.from(JSON.stringify(payload))
  return Buffer.concat([
    cipher.update(compressed ? gzipSync(json) : json),
    cipher.final(),
  ])
}

function decrypt(body) {
  const cipher = createDecipheriv('aes-128-ecb', key, null)
  let bytes = Buffer.concat([cipher.update(Buffer.from(body)), cipher.final()])
  if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes)
  return JSON.parse(bytes.toString())
}

function isCompressed(body) {
  const cipher = createDecipheriv('aes-128-ecb', key, null)
  const bytes = Buffer.concat([
    cipher.update(Buffer.from(body)),
    cipher.final(),
  ])
  return bytes[0] === 31 && bytes[1] === 139
}

function execute(body, path = 'top/tab', headers = {}) {
  const calls = []
  runInNewContext(
    readFileSync(
      new URL('../scripts/netease/home.js', import.meta.url),
      'utf8',
    ),
    {
      $request: { url: root + path },
      $response: { body, headers },
      $done: (value) => calls.push(value),
    },
  )
  expect(calls).toHaveLength(1)
  return calls[0]
}

test.each([true, false])(
  'EAPI AES 响应移除福利入口，保留其他栏目和配置（gzip=%s）',
  (compressed) => {
    const result = execute(
      new Uint8Array(encrypt(fixture, compressed)),
      'top/tab?version=1',
      {
        'Content-Length': '999',
        'Content-Encoding': 'gzip',
        ETag: 'old',
        'X-Test': 'keep',
      },
    )
    const output = decrypt(result.body)
    expect(isCompressed(result.body)).toBe(compressed)
    expect(output.data.commonResourceList.map((x) => x.resCode)).toEqual([
      'fastPlay',
      'rcmd',
      'music',
    ])
    expect(output.data.topTabStyle).toBe(fixture.data.topTabStyle)
    expect(output.message).toBe('')
    expect(result.headers).toEqual({ 'X-Test': 'keep' })
  },
)

test('只取消 freeListen 默认选中，保留底部导航及其余字段', () => {
  const payload = {
    code: 200,
    data: {
      selectedHomeTopTabCode: 'freeListen',
      commonResourceList: [{ title: '首页' }],
      homeFrameworkType: 'fastPlay',
    },
  }
  const output = decrypt(execute(encrypt(payload), 'tab').body)
  expect(output).toEqual({
    code: 200,
    data: {
      commonResourceList: [{ title: '首页' }],
      homeFrameworkType: 'fastPlay',
    },
  })
})

test('明文 JSON 的二进制模式也能改写', () => {
  const result = execute(new Uint8Array(Buffer.from(JSON.stringify(fixture))))
  expect(
    JSON.parse(Buffer.from(result.body).toString()).data.commonResourceList,
  ).toHaveLength(3)
})

test.each([
  [encrypt({ code: 200, data: { selectedHomeTopTabCode: 'rcmd' } }), 'tab'],
  [
    encrypt({
      code: 200,
      data: { commonResourceList: [{ title: '推荐', resCode: 'rcmd' }] },
    }),
    'top/tab',
  ],
  [encrypt({ code: 500, data: fixture.data }), 'top/tab'],
  [encrypt({ code: 200, data: null }), 'top/tab'],
  [
    encrypt({
      code: 200,
      data: { commonResourceList: [fixture.data.commonResourceList[0]] },
    }),
    'top/tab',
  ],
  [new Uint8Array([1, 2, 3]), 'top/tab'],
  [new Uint8Array(16), 'top/tab'],
  [undefined, 'top/tab'],
  [encrypt(fixture), 'top/tab/other'],
])('无匹配、异常或无法保留正常栏目的响应透传：%#', (body, path) => {
  expect(execute(body, path)).toEqual({})
})

test('按组件或 resCode 判断，保留仅标题相同的其他入口', () => {
  const payload = JSON.parse(JSON.stringify(fixture))
  payload.data.commonResourceList.push({
    title: '领福利',
    resCode: 'other',
    url: 'orpheus://other',
  })
  expect(
    decrypt(execute(encrypt(payload)).body).data.commonResourceList.at(-1)
      .resCode,
  ).toBe('other')
})

test('仅组件匹配也移除福利入口', () => {
  const payload = JSON.parse(JSON.stringify(fixture))
  delete payload.data.commonResourceList[0].resCode
  expect(
    decrypt(execute(encrypt(payload)).body).data.commonResourceList,
  ).toHaveLength(3)
})

test.each(['arraybuffer', 'view'])('支持 %s 二进制输入', (kind) => {
  const encrypted = encrypt(fixture)
  const padded = new Uint8Array(encrypted.length + 8)
  padded.set(encrypted, 4)
  const view = padded.subarray(4, 4 + encrypted.length)
  const input = kind === 'view' ? view : view.slice().buffer
  expect(decrypt(execute(input).body).data.commonResourceList).toHaveLength(3)
})
