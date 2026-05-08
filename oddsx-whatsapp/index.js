const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

let sock = null
let isConnected = false
let lastQR = null

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQR = qr
      console.log('\n📱 New QR code generated - visit /qr to scan')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      isConnected = false
      lastQR = null
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed. Reconnecting:', shouldReconnect)
      if (shouldReconnect) connectWhatsApp()
    }

    if (connection === 'open') {
      isConnected = true
      lastQR = null
      console.log('✅ WhatsApp connected!')
    }
  })
}

// QR code page
app.get('/qr', (req, res) => {
  if (isConnected) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff">
        <h2 style="color:#00e5a0">✅ WhatsApp Connected!</h2>
        <p>Your OddsX WhatsApp server is live and ready.</p>
      </body></html>
    `)
  }
  if (!lastQR) {
    return res.send(`
      <html><head><meta http-equiv="refresh" content="3"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff">
        <h2>⏳ Generating QR code...</h2>
        <p>Page will refresh automatically.</p>
      </body></html>
    `)
  }
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`
  res.send(`
    <html><head><meta http-equiv="refresh" content="30"></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff">
      <h2 style="color:#00e5a0">📱 Scan with WhatsApp Business</h2>
      <p>Open WhatsApp → Linked Devices → Link a Device</p>
      <img src="${qrUrl}" style="margin:20px auto;display:block;border-radius:12px">
      <p style="color:#888;font-size:12px">Page auto-refreshes every 30 seconds</p>
    </body></html>
  `)
})

// Status check
app.get('/status', (req, res) => {
  res.json({ connected: isConnected })
})

// Send single message
app.post('/send', async (req, res) => {
  const { phone, message } = req.body
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' })
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' })

  try {
    const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net'
    await sock.sendMessage(jid, { text: message })
    res.json({ success: true, to: phone })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Broadcast to multiple numbers
app.post('/broadcast', async (req, res) => {
  const { phones, message } = req.body
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' })
  if (!phones?.length || !message) return res.status(400).json({ error: 'phones array and message required' })

  const results = []
  for (const phone of phones) {
    try {
      const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net'
      await sock.sendMessage(jid, { text: message })
      results.push({ phone, status: 'sent' })
      await new Promise(r => setTimeout(r, 1500))
    } catch (err) {
      results.push({ phone, status: 'failed', error: err.message })
    }
  }

  res.json({ success: true, results })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 OddsX WhatsApp server running on port ${PORT}`)
  connectWhatsApp()
})