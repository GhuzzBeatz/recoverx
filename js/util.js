function fmtBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function fmtData(d) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch (e) { return String(d) }
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function agora() {
  const d = new Date()
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function tipoIcone(tipo) {
  const icones = {
    foto: 'IMG', documento: 'DOC', video: 'VID',
    audio: 'AUD', comprimido: 'ZIP', outro: 'ARQ'
  }
  return icones[tipo] || 'ARQ'
}

function extIcone(ext) {
  const m = {
    '.jpg': 'IMG', '.jpeg': 'IMG', '.png': 'IMG', '.gif': 'IMG', '.bmp': 'IMG', '.webp': 'IMG',
    '.mp4': 'VID', '.avi': 'VID', '.mov': 'VID', '.mkv': 'VID', '.wmv': 'VID',
    '.mp3': 'AUD', '.wav': 'AUD', '.flac': 'AUD', '.aac': 'AUD',
    '.pdf': 'PDF', '.doc': 'DOC', '.docx': 'DOC', '.xls': 'XLS', '.xlsx': 'XLS',
    '.ppt': 'PPT', '.pptx': 'PPT', '.txt': 'TXT',
    '.zip': 'ZIP', '.rar': 'ZIP', '.7z': 'ZIP'
  }
  return m[ext] || 'ARQ'
}

function avisoModal(msg) {
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove())
  const o = document.createElement('div')
  o.className = 'modal-overlay'
  o.innerHTML = `<div class="modal-box">
    <div style="font-size:13px;color:var(--fg);margin-bottom:20px;line-height:1.7">${msg}</div>
    <button onclick="document.querySelectorAll('.modal-overlay').forEach(el=>el.remove())"
      class="btn btn-primary" style="width:100%;justify-content:center">OK</button>
  </div>`
  document.body.appendChild(o)
}

function confirmar(msg, cb) {
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove())
  const o = document.createElement('div')
  o.className = 'modal-overlay'
  o.innerHTML = `<div class="modal-box">
    <div style="font-size:18px;font-weight:800;color:var(--orange);margin-bottom:12px">ATENCAO</div>
    <div style="font-size:13px;color:var(--fg);margin-bottom:20px;line-height:1.6">${msg}</div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="cfnN" class="btn btn-ghost">Cancelar</button>
      <button id="cfnS" class="btn btn-primary">Confirmar</button>
    </div>
  </div>`
  document.body.appendChild(o)
  const fechar = () => document.querySelectorAll('.modal-overlay').forEach(el => el.remove())
  o.querySelector('#cfnS').onclick = () => { fechar(); cb(true) }
  o.querySelector('#cfnN').onclick = () => { fechar(); cb(false) }
}

function aviso(tipo, msg) {
  const ok = document.getElementById('avisoOk')
  const err = document.getElementById('avisoErro')
  if (tipo === 'ok') {
    if (err) err.style.display = 'none'
    if (ok) { ok.textContent = msg; ok.style.display = 'block'; setTimeout(() => ok.style.display = 'none', 3500) }
  } else {
    if (ok) ok.style.display = 'none'
    if (err) { err.textContent = msg; err.style.display = 'block'; setTimeout(() => err.style.display = 'none', 5000) }
  }
}

function addLog(id, tipo, msg) {
  const box = document.getElementById(id)
  if (!box) return
  const div = document.createElement('div')
  div.className = `log-line log-${tipo}`
  div.innerHTML = `<span class="log-time">${horaAgora()}</span><span>${msg}</span>`
  box.appendChild(div)
  box.scrollTop = box.scrollHeight
}
