import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

export const SOURCES = {
  easylist: {
    title: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
  },
  easylistchina: {
    title: 'EasyList China',
    url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt',
  },
}

const root = fileURLToPath(new URL('..', import.meta.url))
const cacheDir = join(root, '.cache', 'abp')
const outputDir = join(root, 'dist', 'abp')
const converterVersion = '1.0.0'
const maxBytes = 20 * 1024 * 1024
const timeoutMs = 20_000

const recognizedOptions = new Set([
  'domain',
  'third-party',
  'script',
  'image',
  'stylesheet',
  'object',
  'xmlhttprequest',
  'subdocument',
  'document',
  'font',
  'media',
  'ping',
  'websocket',
  'other',
  'popup',
  'webrtc',
  'elemhide',
  'generichide',
  'genericblock',
  'sitekey',
  'match-case',
  'important',
  'badfilter',
  'redirect',
  'redirect-rule',
  'removeparam',
  'csp',
  'header',
  'denyallow',
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function parseList(text, sourceId) {
  const rules = []
  const metadata = {}
  for (const [index, raw] of text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('!')) {
      const match = line.match(
        /^!\s*(Version|Title|Last modified|Expires|Checksum):\s*(.*)$/i,
      )
      if (match) metadata[match[1].toLowerCase()] = match[2]
      continue
    }
    if (/^\[.*\]$/.test(line)) continue
    const base = {
      sourceId,
      raw: line,
      line: index + 1,
      exception: line.startsWith('@@'),
    }
    if (/^(?:#@?#|#\$#|#\$\?#)/.test(line) || /#(?:@?#|\$#|\$\?#)/.test(line)) {
      rules.push({
        ...base,
        type: 'cosmetic',
        pattern: line,
        options: [],
        status: 'unsupported',
        reason: 'cosmetic-filter',
      })
      continue
    }
    const body = base.exception ? line.slice(2) : line
    const dollar = body.lastIndexOf('$')
    const pattern = dollar >= 0 ? body.slice(0, dollar) : body
    const options =
      dollar >= 0
        ? body
            .slice(dollar + 1)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    const unknown = options.filter(
      (option) =>
        !recognizedOptions.has(
          option.replace(/^~/, '').split('=')[0].toLowerCase(),
        ),
    )
    const regex =
      pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 1
    rules.push({
      ...base,
      type: regex ? 'regex' : base.exception ? 'exception' : 'network',
      pattern,
      options,
      status: 'pending',
      ...(unknown.length
        ? { reason: `unknown-option:${unknown.join(',')}` }
        : {}),
    })
  }
  return { rules, metadata }
}

function pureDomain(pattern) {
  const match = pattern.match(
    /^\|\|([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)\^$/i,
  )
  if (!match) return null
  const domain = match[1].toLowerCase()
  if (
    domain.length > 253 ||
    /^\d+(?:\.\d+){3}$/.test(domain) ||
    (domain.startsWith('xn--') && !domain.includes('.'))
  )
    return null
  return domain
}

function exceptionHost(pattern) {
  const match = pattern.match(/^\|\|([a-z0-9.-]+)(?:\^|\/|\?|$)/i)
  if (!match) return null
  return pureDomain(`||${match[1]}^`)
}

function domainOption(options) {
  const values = options.filter((item) =>
    item.toLowerCase().startsWith('domain='),
  )
  if (values.length) return { present: true, value: values[0] }
  return { present: false }
}

function analyze(rule) {
  if (rule.type === 'cosmetic')
    return { ...rule, status: 'unsupported', reason: 'cosmetic-filter' }
  if (rule.type === 'regex')
    return {
      ...rule,
      status: 'unsupported',
      reason: 'abp-regex-not-equivalent-to-shadowrocket',
    }
  if (rule.reason?.startsWith('unknown-option:'))
    return { ...rule, status: 'unsupported' }
  if (rule.exception) {
    const exceptionOptions = rule.options.map((item) => item.toLowerCase())
    const nonScopeOptions = exceptionOptions.filter(
      (item) => !item.startsWith('domain='),
    )
    if (
      exceptionOptions.length > 0 &&
      nonScopeOptions.every((item) =>
        ['elemhide', 'generichide'].includes(item),
      )
    ) {
      return {
        ...rule,
        status: 'unsupported',
        reason: 'cosmetic-exception-not-applicable-to-network-rules',
        cosmeticOnlyException: true,
      }
    }
    const host = exceptionHost(rule.pattern)
    return {
      ...rule,
      status: 'unsupported',
      reason: host
        ? 'exception-cannot-be-represented-as-routing-policy'
        : 'unparsed-exception',
      exceptionDomain: host,
    }
  }
  const domain = pureDomain(rule.pattern)
  if (!domain)
    return { ...rule, status: 'unsupported', reason: 'non-domain-pattern' }
  const options = rule.options.map((item) => item.toLowerCase())
  const domainScope = domainOption(options)
  if (domainScope.present)
    return { ...rule, domain, status: 'unsupported', reason: 'domain-scope' }
  const supportedShape = options.length === 0
  if (!supportedShape) {
    const unsupported = options.filter((item) => item !== 'third-party')
    if (unsupported.length)
      return {
        ...rule,
        domain,
        status: 'unsupported',
        reason: 'resource-or-advanced-option',
      }
    return {
      ...rule,
      domain,
      status: 'unsupported',
      reason: 'third-party-scope',
    }
  }
  return { ...rule, domain, status: 'exact' }
}

function hostMatches(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

export function convertSources(inputs, buildTime = new Date().toISOString()) {
  const all = inputs.flatMap(({ sourceId, text }) => {
    const parsed = parseList(text, sourceId)
    return parsed.rules.map((rule) => ({
      ...analyze(rule),
      metadata: parsed.metadata,
    }))
  })
  const exceptions = all.filter(
    (rule) => rule.exception && !rule.cosmeticOnlyException,
  )
  const unresolvedExceptions = exceptions.filter(
    (rule) => !rule.exceptionDomain,
  )
  const candidateCounts = Object.fromEntries(
    inputs.map(({ sourceId }) => [
      sourceId,
      all.filter(
        (rule) => rule.sourceId === sourceId && rule.status === 'exact',
      ).length,
    ]),
  )
  for (const rule of all.filter((item) => item.status === 'exact')) {
    for (const exception of exceptions) {
      if (
        exception.exceptionDomain &&
        hostMatches(rule.domain, exception.exceptionDomain)
      ) {
        rule.status = 'conflict'
        rule.reason = 'overlaps-exception'
        break
      }
    }
    if (rule.status === 'exact' && unresolvedExceptions.length) {
      rule.status = 'approximate'
      rule.reason = 'unresolved-exception-risk'
    }
  }
  const seen = new Map()
  let duplicates = 0
  for (const rule of all.filter(
    (item) => item.status === 'exact' || item.status === 'approximate',
  )) {
    if (seen.has(rule.domain)) {
      seen.get(rule.domain).sourceIds.push(rule.sourceId)
      seen.get(rule.domain).rules.push(rule)
      rule.duplicateClass = rule.status
      rule.status = 'duplicate'
      rule.reason = 'duplicate-domain-rule'
      duplicates++
    } else
      seen.set(rule.domain, {
        domain: rule.domain,
        sourceIds: [rule.sourceId],
        rules: [rule],
      })
  }
  const emitted = [...seen.values()].sort((a, b) =>
    a.domain.localeCompare(b.domain),
  )
  const safe = emitted.filter((item) => item.rules[0].status === 'exact')
  const reports = inputs.map(({ sourceId }) => {
    const rules = all.filter((item) => item.sourceId === sourceId)
    return makeReport(
      sourceId,
      rules,
      emitted.filter((item) => item.sourceIds.includes(sourceId)),
      0,
      buildTime,
    )
  })
  const combined = makeReport('combined', all, emitted, duplicates, buildTime)
  return {
    all,
    emitted,
    safe,
    reports,
    combined,
    candidateCounts,
    unresolvedExceptionCount: unresolvedExceptions.length,
  }
}

function makeReport(sourceId, rules, emitted, duplicates = 0, buildTime) {
  const reasons = {}
  for (const rule of rules)
    if (rule.reason) reasons[rule.reason] = (reasons[rule.reason] ?? 0) + 1
  return {
    sourceId,
    upstream: [
      ...new Set(rules.map((rule) => rule.metadata?.title).filter(Boolean)),
    ],
    version: [
      ...new Set(rules.map((rule) => rule.metadata?.version).filter(Boolean)),
    ],
    rawRuleCount: rules.length,
    blockingCount: rules.filter(
      (rule) => !rule.exception && rule.type === 'network',
    ).length,
    exceptionCount: rules.filter((rule) => rule.exception).length,
    cosmeticCount: rules.filter((rule) => rule.type === 'cosmetic').length,
    exactCount: rules.filter(
      (rule) => rule.status === 'exact' || rule.duplicateClass === 'exact',
    ).length,
    approximateCount: rules.filter(
      (rule) =>
        rule.status === 'approximate' || rule.duplicateClass === 'approximate',
    ).length,
    unsupportedCount: rules.filter((rule) => rule.status === 'unsupported')
      .length,
    conflictCount: rules.filter((rule) => rule.status === 'conflict').length,
    duplicateCount: duplicates,
    finalOutputCount: emitted.length,
    skippedByReason: reasons,
    buildTime,
  }
}

async function fetchSource(sourceId) {
  const source = SOURCES[sourceId]
  await mkdir(cacheDir, { recursive: true })
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await globalThis.fetch(source.url, {
        signal: globalThis.AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'shadowrocket-toolkit-abp/1.0' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const declaredLength = Number(response.headers.get('content-length'))
      if (declaredLength > maxBytes) throw new Error('内容超过 20 MiB')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('响应体为空')
      const chunks = []
      let totalBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
          await reader.cancel()
          throw new Error('内容超过 20 MiB')
        }
        chunks.push(Buffer.from(value))
      }
      const bytes = Buffer.concat(chunks, totalBytes)
      if (!bytes.length) throw new Error('内容为空')
      const text = bytes.toString('utf8')
      if (
        !text.startsWith('[Adblock Plus 2.0]') ||
        !text.includes('! Version:')
      )
        throw new Error('不是有效的 ABP 订阅文件')
      const record = {
        sourceId,
        url: source.url,
        fetchedAt: new Date().toISOString(),
        sha256: sha256(bytes),
        text,
      }
      const temp = join(cacheDir, `${sourceId}.json.tmp`)
      await writeFile(temp, JSON.stringify(record))
      await rename(temp, join(cacheDir, `${sourceId}.json`))
      return record
    } catch (error) {
      lastError = error
    }
  }
  const cached = await readCached(sourceId).catch(() => null)
  if (cached) return cached
  throw new Error(`${sourceId} 获取失败；未覆盖现有缓存：${lastError?.message}`)
}

async function readCached(sourceId) {
  return JSON.parse(await readFile(join(cacheDir, `${sourceId}.json`), 'utf8'))
}

async function atomicWrite(file, content) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, content)
  await rename(temp, file)
}

async function build(sourceIds, offline = false) {
  const inputs = []
  for (const sourceId of sourceIds) {
    const record = offline
      ? await readCached(sourceId)
      : await fetchSource(sourceId)
    inputs.push({ sourceId, text: record.text, record })
  }
  const epoch = process.env.SOURCE_DATE_EPOCH
  const epochDate = epoch ? new Date(Number(epoch) * 1000) : null
  if (epoch && (!epochDate || !Number.isFinite(epochDate.getTime()))) {
    throw new Error('SOURCE_DATE_EPOCH 必须是有效的 Unix 时间戳秒数')
  }
  const buildTime = epochDate?.toISOString() ?? new Date().toISOString()
  const result = convertSources(inputs, buildTime)
  const groups = [...new Set(sourceIds)]
  if (groups.length > 1) groups.push('combined')
  groups.push('safe', 'experimental')
  for (const group of groups) {
    const selected =
      group === 'safe'
        ? result.safe
        : group === 'combined' || group === 'experimental'
          ? result.emitted
          : result.emitted.filter((item) => item.sourceIds.includes(group))
    const report =
      group === 'combined' || group === 'safe' || group === 'experimental'
        ? result.combined
        : result.reports.find((item) => item.sourceId === group)
    const sourceRecord = inputs.find(
      (input) => group === 'combined' || input.sourceId === group,
    )?.record
    const header = [
      `# Source: ${group === 'combined' || group === 'safe' || group === 'experimental' ? sourceIds.join(' + ') : SOURCES[group].title}`,
      `# Safety: ${group === 'safe' ? 'safe; no unresolved exception overlap' : 'experimental; unresolved ABP exception risk; manual testing only'}`,
      `# Subscription: ${group === 'combined' || group === 'safe' || group === 'experimental' ? sourceIds.map((id) => SOURCES[id].url).join(' ; ') : SOURCES[group].url}`,
      `# Generated: ${report.buildTime}`,
      `# Converter: shadowrocket-toolkit ${converterVersion}`,
      `# SHA-256: ${group === 'safe' || group === 'experimental' || group === 'combined' ? 'multiple sources; see report' : sourceRecord?.sha256}`,
      `# Rules: ${selected.length}`,
      '# Shadowrocket rules; upstream EasyList and EasyList China licensing/attribution applies.',
    ].join('\n')
    const body = selected
      .map((item) => `DOMAIN-SUFFIX,${item.domain},REJECT`)
      .join('\n')
    const dir = join(outputDir, group)
    const skipped =
      group === 'combined' || group === 'safe' || group === 'experimental'
        ? result.all.filter((rule) => rule.status !== 'exact')
        : result.all.filter(
            (rule) => rule.sourceId === group && rule.status !== 'exact',
          )
    const skippedJsonl = skipped
      .map(({ sourceId, line, raw, status, reason }) =>
        JSON.stringify({ sourceId, line, raw, status, reason }),
      )
      .join('\n')
    await atomicWrite(
      join(dir, 'domains.list'),
      `${header}\n${body ? `${body}\n` : ''}`,
    )
    if (group === 'experimental' && selected.length) {
      const smoke =
        selected.find((item) => item.domain === 'ads.linkedin.com') ??
        selected[0]
      await atomicWrite(
        join(dir, 'smoke-test.sgmodule'),
        `#!name=EasyList ABP 实验单规则测试\n#!desc=仅用于手动验证；目标 ${smoke.domain}\n[Rule]\nDOMAIN-SUFFIX,${smoke.domain},REJECT\n`,
      )
      await atomicWrite(
        join(dir, 'domains.sgmodule'),
        `#!name=EasyList ABP 实验域名规则\n#!desc=含未解决的 ABP 例外风险；仅供手动测试\n# Sources: ${sourceIds.map((id) => SOURCES[id].url).join(' ; ')}\n# License: https://easylist.to/pages/licence.html\n# Generated: ${report.buildTime}\n[Rule]\n${body}\n`,
      )
    }
    await atomicWrite(
      join(dir, 'report.json'),
      `${JSON.stringify({ ...report, candidateCounts: result.candidateCounts, unresolvedExceptionCount: result.unresolvedExceptionCount, explicitConflictCount: result.all.filter((rule) => rule.status === 'conflict').length, safeOutputCount: result.safe.length, experimentalOutputCount: result.emitted.length, skippedTrace: 'skipped.jsonl.gz', sources: inputs.filter(({ sourceId }) => group === 'combined' || group === 'safe' || group === 'experimental' || sourceId === group).map(({ sourceId, record }) => ({ sourceId, url: record.url, fetchedAt: record.fetchedAt, sha256: record.sha256 })) }, null, 2)}\n`,
    )
    await atomicWrite(
      join(dir, 'skipped.jsonl.gz'),
      gzipSync(`${skippedJsonl}\n`),
    )
    await atomicWrite(
      join(dir, 'trace.json'),
      `${JSON.stringify(
        selected.map((item) => ({
          output: item.domain,
          sources: item.sourceIds,
          rules: item.rules.map(({ sourceId, line, raw }) => ({
            sourceId,
            line,
            raw,
          })),
        })),
        null,
        2,
      )}\n`,
    )
    await atomicWrite(
      join(dir, 'urls.list'),
      '# URL rules are disabled: ABP URL matching semantics are not proven equivalent.\n',
    )
  }
  await atomicWrite(
    join(outputDir, 'report.json'),
    `${JSON.stringify({ ...result.combined, candidateCounts: result.candidateCounts, unresolvedExceptionCount: result.unresolvedExceptionCount, explicitConflictCount: result.all.filter((rule) => rule.status === 'conflict').length, safeOutputCount: result.safe.length, experimentalOutputCount: result.emitted.length, sources: inputs.map(({ sourceId, record }) => ({ sourceId, url: record.url, fetchedAt: record.fetchedAt, sha256: record.sha256 })) }, null, 2)}\n`,
  )
  console.log(
    `已构建 ${groups.join(', ')}：${result.emitted.length} 条合并域名规则`,
  )
}

async function main(args) {
  const command = args[0] ?? 'build'
  const sourceArg = args.find((arg) => arg.startsWith('--source='))?.slice(9)
  const sourceIds = sourceArg ? sourceArg.split(',') : Object.keys(SOURCES)
  if (sourceIds.some((id) => !SOURCES[id]))
    throw new Error(`未知来源：${sourceArg}`)
  if (command === 'fetch') {
    for (const id of sourceIds) {
      const record = await fetchSource(id)
      console.log(`${id}: ${record.sha256}`)
    }
  } else if (command === 'analyze' || command === 'build')
    await build(sourceIds, args.includes('--offline'))
  else throw new Error(`未知命令：${command}`)
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
