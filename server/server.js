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

// Structural Pathing Fix: Vite emits the client production bundle to dist
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SYS_LOG] Big SYZ Engine running on port ${PORT}`);
});
