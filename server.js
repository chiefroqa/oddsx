const express = require('express');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOUSE_EDGE = 0.06;       // 6% house edge
const MAX_TARGET = 1000;
const INSTANT_CRASH_PROB = 0.01; // optional instant-1x probability

const app = express();

function secureUniform() {
  const buf = crypto.randomBytes(6); // 48 bits
  const n = buf.readUIntBE(0, 6);
  return (n + 1) / Math.pow(2, 48);
}

app.get('/api/crash-target', (req, res) => {
  try {
    const r = secureUniform();
    let target;
    if (r <= INSTANT_CRASH_PROB) {
      target = 1.00;
    } else {
      // Renormalize conditional tail so overall house edge remains HOUSE_EDGE
      // For r in (INSTANT_CRASH_PROB,1], the correct target is (1-HOUSE_EDGE)/(r - INSTANT_CRASH_PROB)
      // which implements P(X=1)=INSTANT_CRASH_PROB and P(X>=x)=(1-HOUSE_EDGE)/x for x>1.
      target = (1 - HOUSE_EDGE) / (r - INSTANT_CRASH_PROB);
      target = Math.max(1.01, Math.min(MAX_TARGET, target));
    }
    const targetRounded = Math.round(target * 100) / 100;
    res.json({ crashTarget: targetRounded, meta: { houseEdge: HOUSE_EDGE, maxTarget: MAX_TARGET } });
  } catch (err) {
    console.error('Error generating crash target', err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.listen(PORT, () => console.log(`Crash RNG server listening on port ${PORT}`));
