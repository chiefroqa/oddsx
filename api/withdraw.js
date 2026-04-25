// api/withdraw.js — Sends M-Pesa payout to user via Intasend B2C

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, amount, user_id } = req.body;

  if (!phone || !amount || !user_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let formattedPhone = phone.replace(/\s/g, '');
  if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);
  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

  try {
    const response = await fetch('https://sandbox.intasend.com/api/v1/send-money/mpesa/', {
      // Production: https://payment.intasend.com/api/v1/send-money/mpesa/
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTASEND_API_KEY}`,
      },
      body: JSON.stringify({
        public_key: process.env.INTASEND_PUBLIC_KEY,
        currency: 'KES',
        transactions: [{
          name: 'OddsX User',
          account: formattedPhone,
          amount: Math.round(amount),
        }],
        narrative: 'OddsX Withdrawal',
        api_ref: `oddsx-withdraw-${user_id}-${Date.now()}`,
      }),
    });

    const data = await response.json();

    if (data.status === 'Preview' || data.status === 'Pending' || data.tracking_id) {
      return res.status(200).json({ success: true, tracking_id: data.tracking_id });
    } else {
      return res.status(400).json({ success: false, error: data.detail || 'Withdrawal failed' });
    }
  } catch (err) {
    console.error('Withdrawal error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
