// api/deposit.js — Vercel Serverless Function
// Triggers an M-Pesa STK Push via Intasend
// Set these in Vercel Dashboard → Settings → Environment Variables:
//   INTASEND_API_KEY, INTASEND_PUBLIC_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, amount, user_id } = req.body;

  if (!phone || !amount || !user_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Format phone: ensure it's 254XXXXXXXXX format
  let formattedPhone = phone.replace(/\s/g, '');
  if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);
  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

  try {
    const response = await fetch('https://sandbox.intasend.com/api/v1/payment/mpesa-stk-push/', {
      // For production use: 'https://payment.intasend.com/api/v1/payment/mpesa-stk-push/'
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTASEND_API_KEY}`,
      },
      body: JSON.stringify({
        public_key: process.env.INTASEND_PUBLIC_KEY,
        currency: 'KES',
        amount: Math.round(amount),
        phone_number: formattedPhone,
        api_ref: `oddsx-${user_id}-${Date.now()}`,
        narrative: 'OddsX Wallet Deposit',
      }),
    });

    const data = await response.json();

    if (data.invoice?.invoice_id) {
      return res.status(200).json({ success: true, invoice_id: data.invoice.invoice_id });
    } else {
      return res.status(400).json({ success: false, error: data.detail || 'STK Push failed' });
    }
  } catch (err) {
    console.error('Intasend error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
