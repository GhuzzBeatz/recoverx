const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')
const { exec, spawn } = require('child_process')

app.setName('RecoverX')

function getDataDir() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(__dirname, 'data')
}
function getToolsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tools')
    : path.join(__dirname, 'tools')
}
function lerJSON(nome, padrao) {
  const f = path.join(getDataDir(), nome + '.json')
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch(e) { return padrao }
}
function salvarJSON(nome, dados) {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, nome + '.json'), JSON.stringify(dados, null, 2))
}

// execAsync — versão não bloqueante do exec
function execAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

function pastaExiste(pasta) {
  try { return fs.existsSync(pasta) } catch (e) { return false }
}

function raizDoDrive(pastaOuDrive) {
  const match = String(pastaOuDrive || '').match(/^[A-Za-z]:/)
  if (!match) return null
  return match[0].toUpperCase() + '\\'
}

function timestampArquivo() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function localizarWinFR() {
  const candidatos = []

  if (process.env.LOCALAPPDATA) {
    candidatos.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winfr.exe'))
  }

  try {
    const out = await execAsync('where.exe winfr')
    for (const linha of String(out || '').split(/\r?\n/)) {
      const limpo = linha.trim()
      if (limpo) candidatos.unshift(limpo)
    }
  } catch (e) {}

  try {
    const out = await execAsync('powershell -NoProfile -NonInteractive -Command "(Get-Command winfr -ErrorAction SilentlyContinue).Source"')
    for (const linha of String(out || '').split(/\r?\n/)) {
      const limpo = linha.trim()
      if (limpo) candidatos.unshift(limpo)
    }
  } catch (e) {}

  for (const candidato of candidatos) {
    if (pastaExiste(candidato)) return candidato
  }

  return null
}

async function statusMotoresScanProfundo() {
  const exe1 = path.join(getToolsDir(), 'photorec_win.exe')
  const exe2 = path.join(getToolsDir(), 'testdisk_win.exe')
  const photorecPath = pastaExiste(exe1) ? exe1 : (pastaExiste(exe2) ? exe2 : null)
  const winfrPath = await localizarWinFR()

  return {
    photorec: {
      disponivel: !!photorecPath,
      caminho: photorecPath
    },
    winfr: {
      disponivel: !!winfrPath,
      caminho: winfrPath
    }
  }
}

function listarPastasRecoveryNoDrive(raizDrive) {
  try {
    return fs.readdirSync(raizDrive, { withFileTypes: true })
      .filter(item => item.isDirectory() && /^Recovery_/i.test(item.name))
      .map(item => path.join(raizDrive, item.name))
  } catch (e) {
    return []
  }
}

function obterNovaPastaRecovery(antes, depois, inicioMs = 0) {
  const mapaAntes = new Set(antes.map(item => item.toLowerCase()))
  const novas = depois.filter(item => !mapaAntes.has(item.toLowerCase()))
  if (novas.length) {
    return novas.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
      } catch (e) {
        return 0
      }
    })[0]
  }

  const recentes = depois.filter(item => {
    try {
      return fs.statSync(item).mtimeMs >= inicioMs
    } catch (e) {
      return false
    }
  })

  return recentes.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
    } catch (e) {
      return 0
    }
  })[0] || null
}

function moverPasta(origem, destino) {
  if (!origem || !pastaExiste(origem)) return null
  const destinoFinal = evitarConflito(destino)
  fs.renameSync(origem, destinoFinal)
  return destinoFinal
}

function filtrosWinFRPorTipos(tipos = []) {
  const grupos = {
    jpg: ['*.jpg', '*.jpeg', '*.jpe'],
    png: ['*.png'],
    pdf: ['*.pdf'],
    doc: ['*.doc', '*.docx', '*.rtf', '*.odt'],
    xls: ['*.xls', '*.xlsx', '*.csv', '*.ods'],
    mp4: ['*.mp4', '*.avi', '*.mov', '*.mkv', '*.wmv', '*.flv', '*.webm', '*.m4v'],
    mp3: ['*.mp3', '*.wav', '*.flac', '*.aac', '*.ogg', '*.wma', '*.m4a'],
    zip: ['*.zip', '*.rar', '*.7z', '*.tar', '*.gz', '*.iso']
  }

  const filtros = new Set()
  for (const tipo of tipos) {
    for (const filtro of (grupos[tipo] || [])) filtros.add(filtro)
  }
  return [...filtros]
}

let win = null, splash = null

function createSplash() {
  splash = new BrowserWindow({
    width: 460, height: 380,
    frame: false, transparent: false,
    resizable: false, center: true,
    alwaysOnTop: true, show: true,
    backgroundColor: '#060810',
    webPreferences: { nodeIntegration: false }
  })
  splash.loadFile('splash.html')
}

function createWindow() {
  const windowOptions = {
    width: 1380, height: 900,
    minWidth: 1100, minHeight: 700,
    title: 'RecoverX', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'logo.ico'),
    backgroundColor: '#0f1420',
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false,
      additionalArguments: ['--data-dir=' + getDataDir(), '--tools-dir=' + getToolsDir()]
    }
  }

  if (process.platform === 'win32') {
    windowOptions.titleBarStyle = 'hidden'
    windowOptions.titleBarOverlay = {
      color: '#0f1420',
      symbolColor: '#e8eef8',
      height: 34
    }
  }

  win = new BrowserWindow(windowOptions)

  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  win.loadFile('index.html')

  win.once('ready-to-show', () => {
    // Aguarda 2s mínimo no splash para não piscar
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) { splash.close(); splash = null }
      win.show(); win.focus()
    }, 2000)
  })

  // Fallback: se demorar muito, fecha o splash mesmo assim
  setTimeout(() => {
    if (splash && !splash.isDestroyed()) { splash.close(); splash = null }
    if (win && !win.isVisible()) win.show()
  }, 8000)

  win.on('page-title-updated', e => e.preventDefault())
}

// ── IPC DADOS ────────────────────────────────────────────────
ipcMain.handle('dados:ler',    async (e, nome)        => lerJSON(nome, []))
ipcMain.handle('dados:salvar', async (e, nome, dados) => { salvarJSON(nome, dados); return { ok:true } })

// ── LISTAR DRIVES (async) ─────────────────────────────────────
ipcMain.handle('drives:listar', async () => {
  try {
    const ps = `Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N='Used';E={$_.Used}},@{N='Free';E={$_.Free}},@{N='Total';E={$_.Used+$_.Free}},Root | ConvertTo-Json`
    const out = await execAsync(`powershell -NoProfile -NonInteractive -Command "${ps}"`)
    let drives = JSON.parse(out)
    if (!Array.isArray(drives)) drives = [drives]
    return drives.filter(d => d.Total > 0).map(d => ({
      letra: d.Name + ':', raiz: d.Root || d.Name + ':\\',
      total: d.Total||0, usado: d.Used||0, livre: d.Free||0,
      pct:   d.Total > 0 ? Math.round((d.Used/d.Total)*100) : 0
    }))
  } catch(e) {
    const drives = []
    for (const l of ['C','D','E','F','G']) {
      try { fs.accessSync(l+':\\'); drives.push({ letra:l+':', raiz:l+':\\', total:0, usado:0, livre:0, pct:0 }) } catch(e2) {}
    }
    return drives
  }
})

// ── SCAN LIXEIRA (async) ──────────────────────────────────────
ipcMain.handle('scan:lixeira', async (e, drive) => {
  const resultados = []
  try {
    const d = drive.replace(':','')
    const ps = `Get-ChildItem -Path "${d}:\\$Recycle.Bin" -Recurse -Force -ErrorAction SilentlyContinue | Where-Object {!$_.PSIsContainer -and $_.Name -notlike '$I*'} | Select-Object FullName,Length,LastWriteTime,Extension | ConvertTo-Json -Depth 2`
    const out = await execAsync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { timeout:20000 })
    if (!out || !out.trim()) return []
    let arquivos = JSON.parse(out)
    if (!Array.isArray(arquivos)) arquivos = [arquivos]
    for (const f of arquivos.slice(0,300)) {
      if (!f.FullName) continue
      const safeId = Buffer.from(f.FullName).toString('hex').slice(0,20)
      resultados.push({
        id: safeId, caminho: f.FullName,
        nome: path.basename(f.FullName),
        ext:  (f.Extension||'').toLowerCase(),
        tamanho: f.Length||0, data: f.LastWriteTime,
        tipo: tipoArquivo((f.Extension||'').toLowerCase()), origem:'lixeira'
      })
    }
  } catch(e) {}
  return resultados
})

// ── SCAN TEMP (async) ─────────────────────────────────────────
ipcMain.handle('scan:temp', async (e, { incluirTemp = true, incluirCache = true, incluirWindowsTemp = true } = {}) => {
  const resultados = []
  const pastas = []
  if (incluirTemp) {
    pastas.push(
      os.tmpdir(),
      path.join(os.homedir(),'AppData','Local','Temp')
    )
  }
  if (incluirWindowsTemp) {
    pastas.push('C:\\Windows\\Temp')
  }
  if (incluirCache) {
    pastas.push(path.join(os.homedir(),'AppData','Local','Microsoft','Windows','INetCache'))
  }
  for (const pasta of pastas) {
    try {
      const arquivos = fs.readdirSync(pasta,{withFileTypes:true})
      for (const f of arquivos.slice(0,150)) {
        if (!f.isFile()) continue
        try {
          const fp   = path.join(pasta, f.name)
          const stat = fs.statSync(fp)
          const ext  = path.extname(f.name).toLowerCase()
          const safeId = Buffer.from(fp).toString('hex').slice(0,20)
          resultados.push({
            id: safeId, caminho: fp, nome: f.name, ext,
            tamanho: stat.size, data: stat.mtime,
            tipo: tipoArquivo(ext), origem: 'temp'
          })
        } catch(e2) {}
      }
    } catch(e) {}
  }
  return resultados
})

// ── SCAN PROFUNDO ─────────────────────────────────────────────
let deepScanProcess = null, deepScanStopped = false, deepScanEngine = null

ipcMain.handle('scan:profundo:status', async () => {
  return statusMotoresScanProfundo()
})

function enviarLogScanProfundo(texto, erro = false) {
  if (win && texto) win.webContents.send('scan:progresso', { texto, erro, motor: deepScanEngine })
}

function executarPhotoRec(drive, destinoEngine) {
  return new Promise(async (resolve) => {
    const status = await statusMotoresScanProfundo()
    const exe = status.photorec.caminho
    if (!exe) {
      resolve({ sucesso: false, erro: 'PhotoRec nao encontrado', instrucoes: true })
      return
    }

    if (!fs.existsSync(destinoEngine)) fs.mkdirSync(destinoEngine, { recursive: true })

    deepScanEngine = 'photorec'
    deepScanProcess = spawn(exe, ['/log', drive.replace(':', ''), destinoEngine], { shell: false })
    deepScanProcess.stdout.on('data', d => enviarLogScanProfundo(String(d || '').trim(), false))
    deepScanProcess.stderr.on('data', d => enviarLogScanProfundo(String(d || '').trim(), true))
    deepScanProcess.on('close', (code) => {
      deepScanProcess = null
      const cancelado = deepScanStopped
      deepScanEngine = null
      if (cancelado) {
        resolve({ sucesso: true, destino: destinoEngine, cancelado: true })
        return
      }
      if (code && code !== 0) {
        resolve({ sucesso: false, erro: `PhotoRec finalizou com codigo ${code}`, destino: destinoEngine })
        return
      }
      resolve({ sucesso: true, destino: destinoEngine, cancelado: false })
    })
    deepScanProcess.on('error', err => {
      deepScanProcess = null
      deepScanEngine = null
      resolve({ sucesso: false, erro: err.message, destino: destinoEngine })
    })
  })
}

function executarWinFR(drive, destinoBase, tipos) {
  return new Promise(async (resolve) => {
    const status = await statusMotoresScanProfundo()
    const exe = status.winfr.caminho
    if (!exe) {
      resolve({ sucesso: false, erro: 'Windows File Recovery nao encontrado neste PC.' })
      return
    }

    const destinoDriveRoot = raizDoDrive(destinoBase)
    if (!destinoDriveRoot) {
      resolve({ sucesso: false, erro: 'Nao foi possivel identificar o drive da pasta de salvamento.' })
      return
    }

    const destinoDrive = destinoDriveRoot.replace(/\\$/, '')
    const antes = listarPastasRecoveryNoDrive(destinoDriveRoot)
    const inicioMs = Date.now()
    const filtros = filtrosWinFRPorTipos(tipos)
    const args = [drive.toUpperCase(), destinoDrive, '/extensive', '/a', '/o:n']
    for (const filtro of filtros) args.push('/n', filtro)

    deepScanEngine = 'winfr'
    deepScanProcess = spawn(exe, args, { shell: false })
    deepScanProcess.stdout.on('data', d => enviarLogScanProfundo(String(d || '').trim(), false))
    deepScanProcess.stderr.on('data', d => enviarLogScanProfundo(String(d || '').trim(), true))
    deepScanProcess.on('close', (code) => {
      deepScanProcess = null
      const cancelado = deepScanStopped
      deepScanEngine = null

      const depois = listarPastasRecoveryNoDrive(destinoDriveRoot)
      const recoveryGerada = obterNovaPastaRecovery(antes, depois, inicioMs)
      let destinoFinal = null

      if (recoveryGerada) {
        try {
          destinoFinal = moverPasta(recoveryGerada, path.join(destinoBase, `WinFR_${path.basename(recoveryGerada)}`))
        } catch (e) {
          resolve({ sucesso: false, erro: `Windows File Recovery finalizou, mas nao foi possivel mover os arquivos: ${e.message}` })
          return
        }
      }

      if (cancelado) {
        resolve({ sucesso: true, destino: destinoFinal || destinoBase, cancelado: true, codigoSaida: code || 0 })
        return
      }

      if (!destinoFinal && code && code !== 0) {
        resolve({ sucesso: false, erro: `Windows File Recovery finalizou com codigo ${code}` })
        return
      }

      resolve({
        sucesso: !!destinoFinal || code === 0,
        destino: destinoFinal || destinoBase,
        cancelado: false,
        codigoSaida: code || 0,
        aviso: destinoFinal ? null : 'Windows File Recovery terminou sem gerar uma nova pasta de recuperacao.'
      })
    })
    deepScanProcess.on('error', err => {
      deepScanProcess = null
      deepScanEngine = null
      resolve({ sucesso: false, erro: err.message })
    })
  })
}

ipcMain.handle('scan:profundo:iniciar', async (e, { drive, destinoBase, tipos, motor }) => {
  const status = await statusMotoresScanProfundo()
  const motorSelecionado = motor || (status.photorec.disponivel && status.winfr.disponivel ? 'hibrido' : (status.photorec.disponivel ? 'photorec' : 'winfr'))
  const usarPhotoRec = motorSelecionado === 'photorec' || motorSelecionado === 'hibrido'
  const usarWinfr = motorSelecionado === 'winfr' || motorSelecionado === 'hibrido'

  if (usarPhotoRec && !status.photorec.disponivel && !usarWinfr) {
    return { sucesso: false, erro: 'PhotoRec nao encontrado', instrucoes: true }
  }
  if (usarWinfr && !status.winfr.disponivel && !usarPhotoRec) {
    return { sucesso: false, erro: 'Windows File Recovery nao encontrado neste PC.' }
  }
  if (!status.photorec.disponivel && !status.winfr.disponivel) {
    return { sucesso: false, erro: 'Nenhum motor de scan profundo esta disponivel.', instrucoes: true }
  }

  const destino = criarPastaScanProfundo(destinoBase)
  if (!fs.existsSync(destino)) fs.mkdirSync(destino, { recursive: true })

  deepScanStopped = false
  const motoresExecutados = []
  const avisos = []
  const erros = []
  let algumSucesso = false

  if (usarWinfr && status.winfr.disponivel) {
    enviarLogScanProfundo('Iniciando etapa 1: Windows File Recovery...', false)
    const resWinfr = await executarWinFR(drive, destino, tipos)
    motoresExecutados.push('winfr')
    if (resWinfr.cancelado) return { sucesso: true, destino, cancelado: true, motoresExecutados, avisos }
    if (resWinfr.sucesso) {
      algumSucesso = true
      if (resWinfr.aviso) avisos.push(resWinfr.aviso)
    } else {
      erros.push(resWinfr.erro)
      avisos.push(`Windows File Recovery: ${resWinfr.erro}`)
    }
  } else if (usarWinfr) {
    avisos.push('Windows File Recovery nao esta instalado neste PC. O RecoverX continuou com os motores disponiveis.')
  }

  if (usarPhotoRec && status.photorec.disponivel && !deepScanStopped) {
    enviarLogScanProfundo(usarWinfr && status.winfr.disponivel ? 'Iniciando etapa 2: PhotoRec...' : 'Iniciando PhotoRec...', false)
    const resPhoto = await executarPhotoRec(drive, path.join(destino, 'PhotoRec'))
    motoresExecutados.push('photorec')
    if (resPhoto.cancelado) return { sucesso: true, destino, cancelado: true, motoresExecutados, avisos }
    if (resPhoto.sucesso) {
      algumSucesso = true
    } else {
      erros.push(resPhoto.erro)
      avisos.push(`PhotoRec: ${resPhoto.erro}`)
    }
  } else if (usarPhotoRec) {
    avisos.push('PhotoRec nao foi encontrado. O RecoverX usou apenas os motores disponiveis.')
  }

  if (!algumSucesso) {
    return {
      sucesso: false,
      erro: erros.filter(Boolean).join(' | ') || 'Nao foi possivel concluir o scan profundo.',
      destino,
      avisos,
      motoresExecutados
    }
  }

  return {
    sucesso: true,
    destino,
    cancelado: false,
    parcial: avisos.length > 0,
    avisos,
    motoresExecutados
  }
})

ipcMain.handle('scan:profundo:parar', async () => {
  if (deepScanProcess) {
    deepScanStopped = true
    try { deepScanProcess.kill() } catch (e) {}
    return { ok: true }
  }
  return { ok: false }
})

ipcMain.handle('scan:profundo:listar', async (e, destino) => {
  const resultados = []
  function varrer(dir, nivel) {
    if (nivel>5 || resultados.length>2000) return
    try {
      for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
        if (item.isDirectory()) varrer(path.join(dir,item.name), nivel+1)
        else {
          try {
            const fp = path.join(dir,item.name)
            const st = fs.statSync(fp)
            const ext = path.extname(item.name).toLowerCase()
            const safeId = Buffer.from(fp).toString('hex').slice(0,20)
            const lower = fp.toLowerCase()
            const origemMotor = lower.includes('\\photorec\\')
              ? 'photorec'
              : (lower.includes('\\winfr_') ? 'winfr' : 'profundo')
            resultados.push({ id:safeId, caminho:fp, nome:item.name, ext, tamanho:st.size, data:st.mtime, tipo:tipoArquivo(ext), origem:origemMotor })
          } catch(e2) {}
        }
      }
    } catch(e) {}
  }
  varrer(destino, 0)
  return resultados
})

// ── RECUPERAR ─────────────────────────────────────────────────
ipcMain.handle('recuperar:arquivos', async (e, { arquivos, destino }) => {
  const ok = [], erro = []
  for (const arq of arquivos) {
    try {
      const dest = evitarConflito(path.join(destino, arq.nome))
      fs.copyFileSync(arq.caminho, dest)
      ok.push({...arq, destino:dest})
    } catch(err) { erro.push({...arq, motivo:err.message}) }
  }
  return { ok, erro }
})

// ── LIMPAR TEMP ───────────────────────────────────────────────
ipcMain.handle('limpar:temp', async (e, arquivos) => {
  let deletados=0, erros=0, liberado=0
  for (const arq of arquivos) {
    try { const st=fs.statSync(arq.caminho); fs.unlinkSync(arq.caminho); deletados++; liberado+=st.size } catch(e){ erros++ }
  }
  return { deletados, erros, liberado }
})

// ── DIÁLOGOS ─────────────────────────────────────────────────
ipcMain.handle('escolher:pasta', async () => {
  const r = await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']})
  if (r.canceled) return null
  return r.filePaths[0]
})
ipcMain.handle('abrir:pasta', async (e, p) => shell.openPath(p))

// ── PREVIEW ───────────────────────────────────────────────────
ipcMain.handle('preview:arquivo', async (e, caminho) => {
  try {
    const ext  = path.extname(caminho).toLowerCase()
    const stat = fs.statSync(caminho)
    if (['.jpg','.jpeg','.png','.gif','.bmp','.webp'].includes(ext)) {
      return { tipo:'imagem', data:fs.readFileSync(caminho).toString('base64'), ext, tamanho:stat.size }
    }
    if (['.txt','.log','.csv','.json'].includes(ext)) {
      return { tipo:'texto', data:fs.readFileSync(caminho,'utf8').slice(0,3000), tamanho:stat.size }
    }
    return { tipo:'binario', tamanho:stat.size }
  } catch(e) { return {tipo:'erro',erro:e.message} }
})

// ── PDF ───────────────────────────────────────────────────────
ipcMain.handle('salvar-pdf', async (event, { htmlContent, nomeArquivo }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(win,{
      defaultPath: nomeArquivo||'recoverx.pdf', filters:[{name:'PDF',extensions:['pdf']}]
    })
    if (canceled||!filePath) return {sucesso:false,motivo:'cancelado'}
    const tmpFile = path.join(getDataDir(),'_tmp.html')
    fs.writeFileSync(tmpFile, htmlContent, 'utf8')
    const tmpWin = new BrowserWindow({show:false,webPreferences:{nodeIntegration:false}})
    await tmpWin.loadFile(tmpFile)
    await new Promise(r=>setTimeout(r,800))
    const pdfBuf = await tmpWin.webContents.printToPDF({
      printBackground:true, pageSize:'A4',
      margins:{marginType:'custom',top:.4,bottom:.4,left:.4,right:.4}
    })
    tmpWin.destroy()
    fs.writeFileSync(filePath,pdfBuf)
    try{fs.unlinkSync(tmpFile)}catch(e){}
    return {sucesso:true,caminho:filePath}
  } catch(e){ return {sucesso:false,erro:e.message} }
})

// ── HELPERS ───────────────────────────────────────────────────
function tipoArquivo(ext) {
  if (['.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.raw','.heic'].includes(ext)) return 'foto'
  if (['.doc','.docx','.pdf','.xls','.xlsx','.ppt','.pptx','.txt','.odt','.rtf'].includes(ext)) return 'documento'
  if (['.mp4','.avi','.mov','.mkv','.wmv','.flv','.webm','.m4v'].includes(ext)) return 'video'
  if (['.mp3','.wav','.flac','.aac','.ogg','.wma','.m4a'].includes(ext)) return 'audio'
  if (['.zip','.rar','.7z','.tar','.gz','.iso'].includes(ext)) return 'comprimido'
  return 'outro'
}
function evitarConflito(dest) {
  if (!fs.existsSync(dest)) return dest
  const dir=path.dirname(dest), ext=path.extname(dest), base=path.basename(dest,ext)
  let i=1
  while (fs.existsSync(path.join(dir,`${base}_${i}${ext}`))) i++
  return path.join(dir,`${base}_${i}${ext}`)
}

function criarPastaScanProfundo(destinoBase) {
  const stamp = new Date().toISOString().replace(/[:.]/g,'-')
  const nome = `RecoverX_Scan_Profundo_${stamp}`
  return path.join(destinoBase, nome)
}

app.whenReady().then(() => { createSplash(); setTimeout(createWindow, 300) })
app.on('window-all-closed', () => { if (process.platform!=='darwin') app.quit() })
