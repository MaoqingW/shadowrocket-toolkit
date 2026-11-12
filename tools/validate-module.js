import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

const moduleFile = fileURLToPath(
  new URL('../modules/my-rules.sgmodule', import.meta.url),
)
const repoRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const sections = new Set(['Rule', 'URL Rewrite', 'Script', 'MITM'])
const hostname =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const sensitive = [
  /\b(?:ss|ssr|vmess|vless|trojan|hysteria2|tuic):\/\//i,
  /https?:\/\/[^/\s]+@[^/\s]+/i,
  /https?:\/\/[^\s,]+\/(?:subscribe|subscription|sub)(?:[/?#\s,]|$)/i,
  /\b(?:authorization|(?:set-)?cookie|(?:access[_-]?)?token|auth|api[_-]?key|secret|password|passwd|ca-p12|ca-passphrase)\s*[:=]\s*\S/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:github_pat_|gh[pousr]_)[a-z0-9_]{16,}/i,
]

function localScriptExists(scriptPath, file) {
  if (isAbsolute(scriptPath) || !/\.js$/i.test(scriptPath)) return false

  try {
    const realFile = realpathSync(resolve(file, '..', scriptPath))
    const insideRepo = relative(repoRoot, realFile)
    return (
      insideRepo !== '..' &&
      !insideRepo.startsWith('..' + sep) &&
      !isAbsolute(insideRepo) &&
      statSync(realFile).isFile()
    )
  } catch {
    return false
  }
}

function scriptAttributes(line) {
  const [, name, attributes] = line.match(/^([^=]+?)\s*=\s*(.+)$/) ?? []
  const [, scriptPath] =
    attributes?.match(/(?:^|,)\s*script-path\s*=\s*([^,\s]+)/) ?? []
  const [, type] = attributes?.match(/(?:^|,)\s*type\s*=\s*([^,\s]+)/) ?? []
  return { name: name?.trim(), scriptPath, type }
}

export function validateModule(source, file = moduleFile) {
  const errors = []
  const metadata = new Set()
  const seenSections = new Set()
  const entries = new Map()
  let section

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    const report = (message) => errors.push(`第 ${index + 1} 行：${message}`)
    const record = (key, value) => {
      const scopedKey = `${section}:${key}`
      if (entries.has(scopedKey)) {
        report(
          entries.get(scopedKey) === value ? '条目重复' : '匹配条件或名称冲突',
        )
      } else {
        entries.set(scopedKey, value)
      }
    }

    if (sensitive.some((pattern) => pattern.test(line)))
      report('疑似敏感信息或订阅地址')
    if (line.startsWith('#!')) {
      const [, key] = line.match(/^#!([a-z][\w-]*)\s*=\s*\S/i) ?? []
      if (!key || section || metadata.has(key))
        report('元数据无效、位置不正确或重复')
      else metadata.add(key)
      continue
    }
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith(';') ||
      line.startsWith('//')
    )
      continue

    if (line.startsWith('[')) {
      section = line.match(/^\[(.+)\]$/)?.[1] ?? ''
      if (!sections.has(section)) report('配置段不在仓库允许范围内')
      else if (seenSections.has(section)) report('配置段重复')
      seenSections.add(section)
      continue
    }

    record(`line:${line}`, line)
    switch (section) {
      case 'Rule': {
        const [, kind, match, action] =
          line.match(
            /^(DOMAIN(?:-SUFFIX|-KEYWORD)?|IP-CIDR6?)\s*,\s*([^,]+)\s*,\s*(.+)$/i,
          ) ?? []
        if (kind)
          record(
            `match:${kind.toUpperCase()},${match.trim().toLowerCase()}`,
            action.trim(),
          )
        break
      }
      case 'URL Rewrite': {
        const [, pattern, action] = line.match(/^(\S+)\s+(.+)$/) ?? []
        if (!pattern) report('Rewrite 缺少匹配模式或动作')
        else record(`pattern:${pattern}`, action)
        break
      }
      case 'Script': {
        const { name, scriptPath, type } = scriptAttributes(line)
        if (!name || !scriptPath || !type) {
          report('脚本缺少名称、type 或 script-path')
          break
        }

        record(`name:${name}`, line)
        if (/(?:^|\/)scripts\/example\//i.test(scriptPath)) {
          report('模拟示例脚本不得绑定到模块')
        } else if (
          !/^https:\/\/[^/\s]+\/[^\s]+$/i.test(scriptPath) &&
          !localScriptExists(scriptPath, file)
        ) {
          report('本地脚本不存在、位于仓库外或使用了不受支持的路径')
        }
        break
      }
      case 'MITM': {
        const [, hosts] = line.match(/^hostname\s*=\s*%APPEND%\s+(.+)$/) ?? []
        if (!hosts) {
          report('MITM 仅允许 hostname = %APPEND% 追加主机名')
          break
        }

        record('hostname', hosts)
        const names = hosts.split(',').map((host) => host.trim().toLowerCase())
        if (names.some((host) => !hostname.test(host)))
          report('MITM 仅允许精确域名')
        if (new Set(names).size !== names.length) report('MITM 主机名重复')
        break
      }
      default:
        report('条目缺少受支持的配置段')
    }
  }

  for (const key of ['name', 'desc']) {
    if (!metadata.has(key)) errors.push(`缺少有效元数据 #!${key}`)
  }
  return errors
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const errors = validateModule(readFileSync(moduleFile, 'utf8'))
    if (errors.length) {
      console.error(errors.join('\n'))
      process.exitCode = 1
    } else {
      console.log('modules/my-rules.sgmodule 静态检查通过')
    }
  } catch (error) {
    console.error(`无法验证模块（${error.code ?? '读取或处理失败'}）`)
    process.exitCode = 1
  }
}
