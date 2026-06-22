module.exports = function createLocalLicenseGate(config) {
  const { storageKey, prefix, salt, multiplier, min = 0, max = Number.MAX_SAFE_INTEGER } = config
  let sessionAuthorized = false

  function generateKey(value) {
    const n = Number(value)
    const p1 = String(n).padStart(4, '0')
    const p2 = Buffer.from(String(n) + salt, 'utf8')
      .toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .slice(0, 4)
      .toUpperCase()
    const p3 = String((n * multiplier) % 9999).padStart(4, '0')
    return `${prefix}-${p1}-${p2}-${p3}`
  }

  function validateKey(value) {
    const clean = String(value || '').trim().toUpperCase()
    const parts = clean.split('-')
    if (parts.length !== 4 || parts[0] !== prefix) return false
    const n = Number.parseInt(parts[1], 10)
    if (!Number.isInteger(n) || n < min || n > max) return false
    return generateKey(n) === clean
  }

  async function authorizeFromStorage(win) {
    if (!win || win.isDestroyed()) return false
    try {
      const key = await win.webContents.executeJavaScript(
        `localStorage.getItem(${JSON.stringify(storageKey)}) || ''`
      )
      sessionAuthorized = validateKey(key)
    } catch (e) {
      sessionAuthorized = false
    }
    return sessionAuthorized
  }

  function isLicensePageUrl(url) {
    try {
      return decodeURIComponent(new URL(url).pathname)
        .replace(/\\/g, '/')
        .endsWith('/pages/licenca.html')
    } catch (e) {
      return false
    }
  }

  function attach(win) {
    win.webContents.on('will-navigate', (event, url) => {
      if (sessionAuthorized || isLicensePageUrl(url)) return
      event.preventDefault()
      authorizeFromStorage(win).then((ok) => {
        if (!win || win.isDestroyed()) return
        win.loadFile(ok ? 'index.html' : 'pages/licenca.html').catch(() => {})
      })
    })
  }

  return {
    attach,
    authorizeFromStorage,
    isSessionAuthorized: () => sessionAuthorized
  }
}
