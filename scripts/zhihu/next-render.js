function filterZhihuAnswerFlow(payload) {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !Array.isArray(payload.data)
  )
    return payload

  const data = payload.data.filter(
    (item) =>
      !(
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        item.type === 'ad'
      ),
  )
  return data.length === payload.data.length ? payload : { ...payload, data }
}

function updateZhihuAnswerFlow(body) {
  if (typeof body !== 'string' || !body.trim()) return {}
  try {
    const input = JSON.parse(body)
    const output = filterZhihuAnswerFlow(input)
    return output === input ? {} : { body: JSON.stringify(output) }
  } catch {
    return {}
  }
}

$done(updateZhihuAnswerFlow($response.body))
