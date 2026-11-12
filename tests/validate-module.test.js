import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

import { expect, test } from 'vitest'
import { validateModule } from '../tools/validate-module.js'

const header = '#!name=测试\n#!desc=测试模块\n'
const script =
  'demo = type=http-response,pattern=^https://example\\.com/demo$,requires-body=1,script-path='

test('接受初始模块和使用精确主机名的配置', () => {
  const module = readFileSync(
    new URL('../modules/my-rules.sgmodule', import.meta.url),
    'utf8',
  )
  expect(validateModule(module)).toEqual([])
  expect(
    validateModule(header + '[MITM]\nhostname = %APPEND% example.com\n'),
  ).toEqual([])
})

test.each([
  ['缺少元数据', '', /元数据/],
  ['未知段', header + '[General]', /配置段/],
  [
    '重复规则',
    header + '[Rule]\nDOMAIN,example.com,REJECT\nDOMAIN,example.com,REJECT',
    /重复/,
  ],
  [
    '同一域名不同策略',
    header + '[Rule]\nDOMAIN,example.com,REJECT\nDOMAIN,EXAMPLE.COM,DIRECT',
    /冲突/,
  ],
  [
    '相同 Rewrite 模式',
    header + '[URL Rewrite]\n^a - reject\n^a - reject-200',
    /冲突/,
  ],
  [
    'MITM 通配符',
    header + '[MITM]\nhostname = %APPEND% *.example.com',
    /精确域名/,
  ],
  ['MITM 覆盖', header + '[MITM]\nhostname = example.com', /%APPEND%/],
  [
    '脚本文件缺失',
    header + '[Script]\n' + script + '../scripts/missing.js',
    /本地脚本/,
  ],
  ['订阅地址', header + '# https://example.com/subscribe', /敏感/],
  ['敏感赋值', header + '# token=mock-only', /敏感/],
  [
    '示例脚本被激活',
    header + '[Script]\n' + script + '../scripts/example/response.js',
    /示例脚本/,
  ],
])('报告%s', (_description, source, error) => {
  expect(validateModule(source).join('\n')).toMatch(error)
})

test('识别仓库内存在的本地 JS 文件', () => {
  expect(
    validateModule(
      header + '[Script]\n' + script + '../tools/validate-module.js',
    ),
  ).toEqual([])
})
