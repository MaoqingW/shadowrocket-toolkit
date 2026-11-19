function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStructuredPromotion(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return false
    }
  }
  if (!isRecord(value) || value.is_card !== true) return false
  const validId =
    (typeof value.id === 'string' && value.id.trim().length > 0) ||
    (typeof value.id === 'number' && Number.isFinite(value.id) && value.id > 0)
  return (
    validId &&
    ['click_tracks', 'impression_tracks', 'view_tracks'].some(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].some(
          (track) => typeof track === 'string' && /^https?:\/\//.test(track),
        ),
    )
  )
}

function isZhihuAdvertisement(item) {
  if (!isRecord(item)) return false
  if (item.type === 'feed_advert') return true

  const content = isRecord(item.unify_content) ? item.unify_content : {}
  const tags = Array.isArray(content.tags) ? content.tags : []
  return (
    tags.some(
      (tag) =>
        isRecord(tag) &&
        tag.code === 'commercial_content_plugin_ad_tag' &&
        tag.value === '广告',
    ) ||
    (isRecord(content.rec) &&
      content.rec.source_type === 'TS_SOURCE_EXTRA_PROMOTION') ||
    (isRecord(item.extra) && isStructuredPromotion(item.extra.promotion)) ||
    (isRecord(content.biz_ext) &&
      isStructuredPromotion(content.biz_ext.promotion))
  )
}

function filterZhihuRecommendation(payload) {
  if (!isRecord(payload)) return payload
  let output = payload
  for (const key of ['data', 'dataV1']) {
    if (!Array.isArray(payload[key])) continue
    const filtered = payload[key].filter((item) => !isZhihuAdvertisement(item))
    if (filtered.length === payload[key].length) continue
    if (output === payload) output = { ...payload }
    output[key] = filtered
  }
  return output
}

function updateZhihuRecommendation(body) {
  if (typeof body !== 'string' || !body.trim()) return {}
  try {
    const input = JSON.parse(body)
    const output = filterZhihuRecommendation(input)
    return output === input ? {} : { body: JSON.stringify(output) }
  } catch {
    return {}
  }
}

$done(updateZhihuRecommendation($response.body))
