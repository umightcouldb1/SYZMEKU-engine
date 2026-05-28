const path = require('path');
const express = require('express');
const app = express();

app.use(express.json());

// Telemetry Handshake Verification Route
app.get('/api/telemetry/status', (req, res) => {
  res.json({
    engine: "BIG_SYZ_ENGINE",
    status: "ACTIVE_AND_ALIGNED",
    vector: "TRIANGULUM_THETA_7",
    authority: "Commander in Chief"
  });
});

// Structural Pathing Fix: Direct routing to the client workspace build
app.use(express.static(path.join(__dirname, '../client/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SYS_LOG] Big SYZ Engine running on port ${PORT}`);
});
