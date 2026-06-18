// ── RecoverX — Sistema de Licença GHZ Plugin ─────────────────
const RX_PREFIX = 'REXV'
const RX_SALT   = 'GHZ2026RECOVERX'
const RX_MULT   = 53
const RX_KEY    = '@RECOVERX:licenca'

function gerarChaveRX(n) {
  const p1 = String(n).padStart(4, '0')
  const p2 = btoa(n + RX_SALT).replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()
  const p3 = String((n * RX_MULT) % 9999).padStart(4, '0')
  return `${RX_PREFIX}-${p1}-${p2}-${p3}`
}

function validarChaveRX(chave) {
  if (!chave) return false
  const c = chave.toUpperCase().trim()
  const partes = c.split('-')
  if (partes.length !== 4) return false
  if (partes[0] !== RX_PREFIX) return false
  const n = parseInt(partes[1])
  if (isNaN(n) || n < 1 || n > 9999) return false
  return c === gerarChaveRX(n)
}

function licencaAtivaRX() {
  try {
    const salva = localStorage.getItem(RX_KEY)
    if (!salva) return false
    return validarChaveRX(salva)
  } catch(e) { return false }
}

function salvarLicencaRX(chave) {
  localStorage.setItem(RX_KEY, chave.toUpperCase().trim())
}

function removerLicencaRX() {
  localStorage.removeItem(RX_KEY)
}

function getLicencaRX() {
  return localStorage.getItem(RX_KEY) || ''
}
