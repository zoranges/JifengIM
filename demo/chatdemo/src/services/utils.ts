const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/adventurer/svg'

export function avatarUrl(seed: string): string {
  return `${DICEBEAR_BASE}?seed=${seed}&radius=50&backgroundType=gradientLinear&backgroundColor=4f6ef7,00d4aa`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function highlightText(text: string, query: string): string {
  if (!query || !text) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
