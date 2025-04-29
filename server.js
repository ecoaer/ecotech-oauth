const express = require("express");
const axios = require("axios");
const path = require("path");
const app = express();

const CLIENT_ID = "37582612-90de-4a8c-a51b-cc6d4883522e";
const CLIENT_SECRET = "hVS569gvgDAC0FoslF76pnFxomNFySkxNPD";
const REDIRECT_URI = "https://ecotech-oauth.onrender.com/oauth/callback";

// Servește fișiere statice, inclusiv index.html
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/oauth-callback.html", (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("❌ Missing code.");
  res.redirect(`/oauth/callback?code=${code}`);
});

app.get("/oauth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("❌ No code provided.");

  try {
    const response = await axios.post(
      "https://connectapi.garmin.com/oauth-service/oauth/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.send(`
      <h2>✅ Access Token Received!</h2>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
    `);
  } catch (err) {
    const errorMsg = err.response?.data || err.message;
    console.error("🔴 Error from Garmin:", errorMsg);
    res.status(500).send(`
      <h2>❌ Error exchanging token</h2>
      <pre>${JSON.stringify(errorMsg, null, 2)}</pre>
    `);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("✅ Server listening on port", port);
});
