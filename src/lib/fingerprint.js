// Content-identity hash matching the desktop app's storage.py: sha1(size_ascii + first 64KB).
// Lets progress/metadata survive a rename or move in Drive, independent of file path/id.
const FP_HEAD = 65536

export async function computeFingerprint(arrayBuffer) {
  const size = arrayBuffer.byteLength
  const sizeBytes = new TextEncoder().encode(String(size))
  const head = new Uint8Array(arrayBuffer, 0, Math.min(FP_HEAD, size))
  const combined = new Uint8Array(sizeBytes.length + head.length)
  combined.set(sizeBytes, 0)
  combined.set(head, sizeBytes.length)
  const digest = await crypto.subtle.digest('SHA-1', combined)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `c1:${hex}`
}
