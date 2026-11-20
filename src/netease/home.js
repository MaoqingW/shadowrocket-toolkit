import CryptoJS from 'crypto-js/core.js'
import 'crypto-js/aes.js'
import 'crypto-js/mode-ecb.js'
import 'crypto-js/pad-nopadding.js'
import { gzip, ungzip } from 'pako'

// Public EAPI protocol constant, not an account credential.
const eapiKey = CryptoJS.enc.Utf8.parse('e82ckenh8dichen8')
const endpoint =
  /^https:\/\/interface3\.music\.163\.com\/eapi\/link\/home\/framework\/(tab|top\/tab)(?:\?|$)/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toWords(bytes) {
  const words = []
  for (let i = 0; i < bytes.length; i++)
    words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8))
  return CryptoJS.lib.WordArray.create(words, bytes.length)
}

function toBytes(wordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255
  return bytes
}

function decodeBody(body) {
  if (typeof body === 'string')
    return { payload: JSON.parse(body), encrypted: false, text: true }
  let bytes
  if (ArrayBuffer.isView(body))
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]')
    bytes = new Uint8Array(body)
  else throw new Error('Unsupported body')
  if (!bytes.length) throw new Error('Empty body')

  // Binary mode can also receive a plaintext JSON response.
  try {
    return {
      payload: JSON.parse(CryptoJS.enc.Utf8.stringify(toWords(bytes))),
      encrypted: false,
    }
  } catch {
    // EAPI ciphertext must be complete AES blocks with valid PKCS#7 padding.
  }
  if (bytes.length % 16) throw new Error('Incomplete AES blocks')
  const decrypted = toBytes(
    CryptoJS.AES.decrypt({ ciphertext: toWords(bytes) }, eapiKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding,
    }),
  )
  const padding = decrypted[decrypted.length - 1]
  if (padding < 1 || padding > 16) throw new Error('Invalid padding')
  for (let i = decrypted.length - padding; i < decrypted.length; i++)
    if (decrypted[i] !== padding) throw new Error('Invalid padding')
  let plain = decrypted.subarray(0, decrypted.length - padding)
  const compressed = plain[0] === 31 && plain[1] === 139
  if (compressed) plain = ungzip(plain)
  return {
    payload: JSON.parse(CryptoJS.enc.Utf8.stringify(toWords(plain))),
    encrypted: true,
    compressed,
  }
}

function filterHome(payload, path) {
  if (!isRecord(payload) || payload.code !== 200 || !isRecord(payload.data))
    return false
  const data = payload.data
  if (path === 'tab') {
    if (data.selectedHomeTopTabCode !== 'freeListen') return false
    // Do not invent a default code: let the client select a remaining tab.
    delete data.selectedHomeTopTabCode
    return true
  }
  if (!Array.isArray(data.commonResourceList)) return false
  const keep = data.commonResourceList.filter(
    (item) =>
      !isRecord(item) ||
      !(
        item.resCode === 'freeListen' ||
        (typeof item.url === 'string' &&
          /[?&]component=rn-ad-free-music(?:&|$)/.test(item.url))
      ),
  )
  // An unexpected response containing only the welfare tab should pass through.
  if (
    keep.length === data.commonResourceList.length ||
    !keep.some((item) => isRecord(item) && typeof item.resCode === 'string')
  )
    return false
  data.commonResourceList = keep
  return true
}

function rewriteHome(request, response) {
  try {
    const match = endpoint.exec(request.url)
    if (!match) return {}
    const decoded = decodeBody(response.body)
    if (!filterHome(decoded.payload, match[1])) return {}
    const json = JSON.stringify(decoded.payload)
    let body = toBytes(CryptoJS.enc.Utf8.parse(json))
    if (decoded.encrypted) {
      if (decoded.compressed) body = gzip(body)
      body = toBytes(
        CryptoJS.AES.encrypt(toWords(body), eapiKey, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        }).ciphertext,
      )
    } else if (decoded.text) body = json
    const headers = { ...response.headers }
    for (const name of Object.keys(headers))
      if (
        /^(content-length|content-encoding|transfer-encoding|etag|content-md5|digest)$/i.test(
          name,
        )
      )
        delete headers[name]
    return { body, headers }
  } catch {
    return {}
  }
}

$done(rewriteHome($request, $response))
