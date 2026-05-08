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

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Scan this QR code with your WhatsApp Business number:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      isConnected = false
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed. Reconnecting:', shouldReconnect)
      if (shouldReconnect) connectWhatsApp()
    }

    if (connection === 'open') {
      isConnected = true
      console.log('✅ WhatsApp connected!')
    }
  })
}

// Send single message
app.post('/send', async (req, res) => {
  const { phone, message } = req.body
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' })
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' })

  try {
    // Format: 2547XXXXXXXX@s.whatsapp.net
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
      // Small delay between messages to avoid ban
      await new Promise(r => setTimeout(r, 1500))
    } catch (err) {
      results.push({ phone, status: 'failed', error: err.message })
    }
  }

  res.json({ success: true, results })
})

// Health check
app.get('/status', (req, res) => {
  res.json({ connected: isConnected })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 OddsX WhatsApp server running on port ${PORT}`)
  connectWhatsApp()
})