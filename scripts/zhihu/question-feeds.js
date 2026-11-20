function filterZhihuQuestionFeeds(payload) {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !Object.prototype.hasOwnProperty.call(payload, 'ad_info')
  )
    return payload

  return { ...payload, ad_info: null }
}

function updateZhihuQuestionFeeds(body) {
  if (typeof body !== 'string' || !body.trim()) return {}
  try {
    const input = JSON.parse(body)
    const output = filterZhihuQuestionFeeds(input)
    return output === input ? {} : { body: JSON.stringify(output) }
  } catch {
    return {}
  }
}

$done(updateZhihuQuestionFeeds($response.body))
