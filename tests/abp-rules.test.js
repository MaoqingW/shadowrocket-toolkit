import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { convertSources, parseList } from '../tools/abp-rules.js'

const fixture = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../fixtures/abp/${name}`, import.meta.url)),
    'utf8',
  )

describe('ABP parsing and conservative conversion', () => {
  it('converts only unrestricted pure domain anchors', () => {
    const result = convertSources([
      { sourceId: 'easylist', text: '||ads.example.com^\n||sub.example.com^' },
    ])
    expect(result.emitted.map((item) => item.domain)).toEqual([
      'ads.example.com',
      'sub.example.com',
    ])
  })

  it('rejects path, wildcard, regex, resource, third-party and scoped rules', () => {
    const text = [
      '||ads.example.com/banner.js',
      '/foo.*/',
      '||x.example.com^$script',
      '||y.example.com^$third-party',
      '||z.example.com^$domain=site.example',
      '||w.example.com/ad*',
      '||q.example.com^$unknown',
    ].join('\n')
    const { rules } = parseList(text, 'fixture')
    expect(rules.map((rule) => rule.status)).toEqual(Array(7).fill('pending'))
    const result = convertSources([{ sourceId: 'fixture', text }])
    expect(result.emitted).toHaveLength(0)
    expect(result.all.every((rule) => rule.status === 'unsupported')).toBe(true)
  })

  it('excludes known host conflicts and marks unknown exceptions as experimental', () => {
    const result = convertSources([
      {
        sourceId: 'easylist',
        text: '||ads.example.com^\n@@||ads.example.com/safe.js\n||other.example.com^\n@@/opaque-pattern/',
      },
    ])
    expect(result.emitted.map((item) => item.domain)).toEqual([
      'other.example.com',
    ])
    expect(result.safe).toHaveLength(0)
    expect(result.unresolvedExceptionCount).toBe(1)
    expect(
      result.all.filter((rule) => rule.status === 'conflict'),
    ).toHaveLength(1)
  })

  it('keeps a pure domain exception from becoming a routing rule', () => {
    const result = convertSources([
      {
        sourceId: 'easylist',
        text: '||ads.example.com^\n@@||ads.example.com^',
      },
    ])
    expect(result.emitted).toHaveLength(0)
    expect(result.all.find((rule) => rule.exception).reason).toBe(
      'exception-cannot-be-represented-as-routing-policy',
    )
  })

  it('does not let cosmetic-only exceptions suppress network rules', () => {
    const result = convertSources([
      {
        sourceId: 'easylist',
        text: '||ads.example.com^\n@@||site.example.com^$generichide',
      },
    ])
    expect(result.emitted.map((item) => item.domain)).toEqual([
      'ads.example.com',
    ])
  })

  it('deduplicates across both fixtures and preserves traceable origins', () => {
    const result = convertSources([
      { sourceId: 'easylist', text: fixture('easylist.txt') },
      { sourceId: 'easylistchina', text: fixture('easylistchina.txt') },
    ])
    expect(result.emitted.map((item) => item.domain)).toContain(
      'china.example.cn',
    )
    expect(
      result.emitted.find((item) => item.domain === 'ads.example.com')
        .sourceIds,
    ).toEqual(['easylist', 'easylistchina'])
    expect(
      result.all.find((rule) => rule.raw === '||image.example.com^$image')
        .reason,
    ).toBe('resource-or-advanced-option')
    expect(result.all.find((rule) => rule.raw === '##.advert').type).toBe(
      'cosmetic',
    )
  })

  it('produces deterministic ordered output', () => {
    const text = '||z.example.com^\n||a.example.com^\n||m.example.com^'
    const build = () =>
      convertSources([{ sourceId: 'easylist', text }]).emitted.map(
        (item) => item.domain,
      )
    expect(build()).toEqual(build())
    expect(build()).toEqual(['a.example.com', 'm.example.com', 'z.example.com'])
  })
})
