// 仅供模拟数据测试。此脚本不应绑定真实 App。
function removeMockPromotion(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !Object.prototype.hasOwnProperty.call(payload, 'mockPromotion') ||
    payload.mockPromotion?.kind !== 'ad'
  ) {
    return payload
  }

  const output = { ...payload }
  delete output.mockPromotion
  return output
}

function responseUpdate(body) {
  if (typeof body !== 'string' || !body.trim()) return {}

  try {
    const input = JSON.parse(body)
    const output = removeMockPromotion(input)
    return input === output ? {} : { body: JSON.stringify(output) }
  } catch {
    return {}
  }
}

$done(responseUpdate($response.body))
