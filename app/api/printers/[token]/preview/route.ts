// app/api/printers/[token]/preview/route.ts
//
// Página HTML de simulação de impressora térmica.
// Abra a URL /api/printers/{token}/preview no navegador para simular
// uma impressora real: faz polling, exibe a comanda e abre o diálogo de impressão.
// Para testar sem impressora física: salve como PDF ou use Ctrl+P.

import { prisma } from '@/lib/db/client'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const printer = await prisma.printer.findFirst({
    where: { token },   // sem isActive — permite testar mesmo com impressora "offline"
    select: { id: true, name: true, sector: true },
  })

  const printerName = printer?.name ?? 'Impressora não encontrada'
  const found = !!printer

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Simulador de Impressora — ${printerName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Courier New', monospace;
      background: #1a1a1a;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }

    .ui-bar {
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .printer-info h1 { font-family: sans-serif; font-size: 16px; color: #fff; }
    .printer-info p  { font-family: sans-serif; font-size: 12px; color: #888; margin-top: 2px; }

    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: sans-serif;
      font-size: 13px;
    }
    .dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #666;
    }
    .dot.online  { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
    .dot.waiting { background: #f59e0b; animation: pulse 1.5s infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    .controls {
      display: flex;
      gap: 8px;
    }

    button {
      font-family: sans-serif;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    button.primary  { background: #f97316; color: #fff; }
    button.secondary { background: #333; color: #ccc; border: 1px solid #555; }

    .log {
      font-family: sans-serif;
      font-size: 11px;
      color: #666;
      margin-bottom: 16px;
    }

    .receipts { display: flex; flex-direction: column; gap: 20px; }

    .receipt {
      background: #fff;
      color: #000;
      width: 320px;
      max-width: 100%;
      padding: 16px;
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      position: relative;
    }

    .receipt pre {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .receipt-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }

    .receipt .timestamp {
      font-family: sans-serif;
      font-size: 10px;
      color: #888;
      margin-bottom: 8px;
    }

    .badge-new {
      background: #22c55e;
      color: #fff;
      font-family: sans-serif;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 8px;
      border-radius: 99px;
      position: absolute;
      top: 12px;
      right: 12px;
    }

    .empty {
      font-family: sans-serif;
      color: #555;
      text-align: center;
      padding: 60px 20px;
      border: 2px dashed #333;
      border-radius: 12px;
    }
    .empty p { margin-top: 8px; font-size: 13px; }

    @media print {
      body { background: #fff; padding: 0; }
      .ui-bar, .controls, .receipt-actions, .badge-new, .log { display: none !important; }
      .receipt { box-shadow: none; border: none; padding: 0; width: 80mm; }
      .receipts { gap: 0; }
    }
  </style>
</head>
<body>

<div class="ui-bar">
  <div class="printer-info">
    <h1>🖨️ ${printerName}</h1>
    <p>${found ? `Setor: ${printer?.sector ?? '—'} · Token: ${token.slice(0, 12)}...` : 'Token inválido ou impressora desativada'}</p>
  </div>
  <div class="status">
    <div class="dot ${found ? 'waiting' : ''}" id="statusDot"></div>
    <span id="statusText">${found ? 'Aguardando pedidos…' : 'Offline'}</span>
  </div>
  <div class="controls">
    <button class="secondary" onclick="togglePoll()">⏸ Pausar</button>
    <button class="primary" onclick="window.print()">🖨️ Imprimir tela</button>
  </div>
</div>

<p class="log" id="log">Iniciando polling a cada 5 segundos…</p>

<div id="receipts" class="receipts">
  <div class="empty" id="empty">
    <div style="font-size:48px">🧾</div>
    <p>Nenhum pedido ainda.<br>Faça um pedido pelo cardápio para ver a comanda aqui.</p>
  </div>
</div>

<script>
  const TOKEN   = '${token}'
  const BASE    = '/api/printers/' + TOKEN
  const dot     = document.getElementById('statusDot')
  const status  = document.getElementById('statusText')
  const log     = document.getElementById('log')
  const receipts = document.getElementById('receipts')
  const empty   = document.getElementById('empty')

  let running = true
  let pollCount = 0

  function setStatus(online, text) {
    dot.className = 'dot ' + (online ? 'online' : 'waiting')
    status.textContent = text
  }

  function addReceipt(job) {
    empty.style.display = 'none'
    const div = document.createElement('div')
    div.className = 'receipt'
    div.dataset.jobId = job.id
    div.innerHTML = \`
      <span class="badge-new">NOVO</span>
      <div class="timestamp">Recebido às \${new Date().toLocaleTimeString('pt-BR')} · Job #\${job.id.slice(-6)}</div>
      <pre>\${escapeHtml(job.content)}</pre>
      <div class="receipt-actions">
        <button class="primary" onclick="printJob('\${job.id}', this)">🖨️ Imprimir</button>
        <button class="secondary" onclick="dismissJob('\${job.id}', this.parentElement.parentElement)">✓ Confirmar</button>
      </div>
    \`
    receipts.insertBefore(div, receipts.firstChild)

    // Som de notificação
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
    } catch {}
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  async function printJob(jobId, btn) {
    btn.disabled = true
    btn.textContent = '…'
    window.print()
    await confirmJob(jobId)
    btn.textContent = '✓ Impresso'
  }

  async function dismissJob(jobId, el) {
    await confirmJob(jobId)
    el.remove()
    if (!document.querySelector('.receipt')) {
      empty.style.display = ''
    }
  }

  async function confirmJob(jobId) {
    try {
      await fetch(BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, status: 'PRINTED' }),
      })
    } catch {}
  }

  const seenJobs = new Set()

  async function poll() {
    if (!running || !${found}) return
    pollCount++
    try {
      const res  = await fetch(BASE)
      const data = await res.json()
      const jobs = data.jobs ?? []

      setStatus(true, jobs.length > 0 ? \`\${jobs.length} pedido(s) para imprimir!\` : 'Online · aguardando pedidos…')
      log.textContent = \`Última verificação: \${new Date().toLocaleTimeString('pt-BR')} (verificação #\${pollCount})\`

      for (const job of jobs) {
        if (!seenJobs.has(job.id)) {
          seenJobs.add(job.id)
          addReceipt(job)
        }
      }
    } catch (e) {
      setStatus(false, 'Erro de conexão — reconectando…')
    }
    setTimeout(poll, 5000)
  }

  function togglePoll() {
    running = !running
    document.querySelector('button.secondary').textContent = running ? '⏸ Pausar' : '▶ Retomar'
    if (running) poll()
  }

  poll()
</script>

</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
