// api/deposit-status.js — Polls Intasend to check if payment was completed

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { invoice_id } = req.query;
  if (!invoice_id) return res.status(400).json({ error: 'Missing invoice_id' });

  try {
    const response = await fetch(`https://payment.intasend.com/api/v1/payment/status/`, {
      // Production: https://payment.intasend.com/api/v1/payment/status/
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTASEND_API_KEY}`,
      },
      body: JSON.stringify({
        public_key: process.env.INTASEND_PUBLIC_KEY,
        invoice_id,
      }),
    });

    const data = await response.json();
    const paid = data.invoice?.state === 'COMPLETE';

    return res.status(200).json({ paid, state: data.invoice?.state });
  } catch (err) {
    console.error('Status check error:', err);
    return res.status(500).json({ paid: false, error: 'Server error' });
  }
}
