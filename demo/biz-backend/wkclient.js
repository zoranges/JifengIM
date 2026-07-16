// Internal HTTP client for calling WuKongIM APIs
const WK_API_URL = process.env.WK_API_URL || 'http://127.0.0.1:5001';

export async function wkCreateChannel(channelId, channelType) {
  const res = await fetch(`${WK_API_URL}/channel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      channel_type: channelType,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WuKongIM channel create failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function wkAddSubscriber(channelId, channelType, uid) {
  const res = await fetch(`${WK_API_URL}/channel/subscriber_add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      channel_type: channelType,
      subscribers: [uid],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WuKongIM subscriber_add failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function wkRemoveSubscriber(channelId, channelType, uid) {
  const res = await fetch(`${WK_API_URL}/channel/subscriber_remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      channel_type: channelType,
      subscribers: [uid],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WuKongIM subscriber_remove failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function wkGetUserToken(uid, token) {
  const res = await fetch(`${WK_API_URL}/user/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid,
      token,
      device_flag: 1,
      device_level: 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WuKongIM /user/token failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function wkDeleteChannel(channelId, channelType) {
  const res = await fetch(`${WK_API_URL}/channel/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: channelId,
      channel_type: channelType,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WuKongIM channel delete failed (${res.status}): ${text}`);
  }
  return res.json();
}
