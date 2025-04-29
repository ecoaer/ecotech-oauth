const express = require("express");
const axios = require("axios");
const oauth1a = require("oauth-1.0a");
const crypto = require("crypto");
const qs = require("querystring");
const app = express();

const CONSUMER_KEY = "b0f7d68c-cf48-40b0-97be-fb1c4e7c3d7f";
const CONSUMER_SECRET = "sQ4dzcS9LruCV4fH";
const CALLBACK_URL = "https://ecotech-oauth.onrender.com/oauth/callback.html";

// Inițializează semnătura OAuth1
const oauth = oauth1a({
  consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
  signature_method: "HMAC-SHA1",
  hash_function(base_string, key) {
    return crypto.createHmac("sha1", key).update(base_string).digest("base64");
  },
});

// Test de pornire server
app.get("/", (req, res) => {
  res.send("✅ Ecotech OAuth1 server is running.");
});

// Start OAuth
app.get("/oauth/start", async (req, res) => {
  const request_data = {
    url: "https://connectapi.garmin.com/oauth-service/oauth/request_token",
    method: "POST",
    data: { oauth_callback: CALLBACK_URL },
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(request_data));
    const response = await axios.post(request_data.url, qs.stringify({ oauth_callback: CALLBACK_URL }), {
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const respData = qs.parse(response.data);
    res.redirect(`https://connect.garmin.com/oauthConfirm?oauth_token=${respData.oauth_token}`);
  } catch (err) {
    console.error("❌ Failed to get request token:", err.response?.data || err.message);
    res.send("Failed to get request token");
  }
});

// Callback după autentificare
app.get("/oauth/callback", async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  if (!oauth_token || !oauth_verifier) return res.status(400).send("Missing token or verifier");

  const request_data = {
    url: "https://connectapi.garmin.com/oauth-service/oauth/access_token",
    method: "POST",
    data: { oauth_token, oauth_verifier },
  };

  try {
    const token = { key: oauth_token, secret: "" }; // Garmin nu trimite secret temporar
    const headers = oauth.toHeader(oauth.authorize(request_data, token));

    const response = await axios.post(request_data.url, qs.stringify({ oauth_token, oauth_verifier }), {
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const finalData = qs.parse(response.data);
    res.send(`<h2>✅ OAuth 1.0 Access Token</h2><pre>${JSON.stringify(finalData, null, 2)}</pre>`);
  } catch (err) {
    console.error("❌ Failed to get access token:", err.response?.data || err.message);
    res.send("Failed to get access token");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("✅ Server running on port", port);
});
