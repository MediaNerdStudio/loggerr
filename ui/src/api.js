async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Request failed (${response.status})`); }
  return response.status === 204 ? null : response.json();
}
export const api = {
  recordings: () => request('/api/recordings'),
  presets: () => request('/api/presets'),
  alerts: () => request('/api/alerts'),
  storage: () => request('/api/storage'),
  acknowledgeAlert: id => request(`/api/alerts/${id}/acknowledge`, { method: 'POST' }),
  acknowledgeAllAlerts: () => request('/api/alerts/acknowledge-all', { method: 'POST' }),
  createRecording: body => request('/api/recordings', { method: 'POST', body: JSON.stringify(body) }),
  updateRecording: (id, body) => request(`/api/recordings/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRecording: id => request(`/api/recordings/${id}`, { method: 'DELETE' }),
  files: id => request(`/api/recordings/${id}/files`),
  trigger: (id, action) => request(`/api/recordings/${id}/trigger/${action}`, { method: 'POST' }),
  createPreset: body => request('/api/presets', { method: 'POST', body: JSON.stringify(body) }),
  deletePreset: id => request(`/api/presets/${id}`, { method: 'DELETE' })
};
