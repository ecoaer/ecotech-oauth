const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const qs = require("querystring");
const app = express();

const CONSUMER_KEY = "[37582612-90de-4a8c-a51b-cc6d4883522e]";
const CONSUMER_SECRET = "[hVS569gvgDAC0FoslF76pnFxomNFySkxNPD]";
const CALLBACK_URL = "https://ecotech-oauth.onrender.com/oauth/callback";

function getOAuthSignature(method, url, params, consumerSecret, tokenSecret = "") {
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

app.get("/", (req, res) => {
  res.send("✅ Ecotech OAuth1 server running.");
});

app.get("/oauth/start", async (req, res) => {
  const oauthParams = {
    oauth_callback: CALLBACK_URL,
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_version: "1.0"
  };

  oauthParams.oauth_signature = getOAuthSignature(
    "POST",
    "https://connectapi.garmin.com/oauth-service/oauth/request_token",
    oauthParams,
    CONSUMER_SECRET
  );

  try {
    const response = await axios.post(
      "https://connectapi.garmin.com/oauth-service/oauth/request_token",
      null,
      {
        headers: {
          Authorization: `OAuth ${Object.entries(oauthParams).map(([k,v]) => `${k}="${encodeURIComponent(v)}"`).join(", ")}`
        }
      }
    );
    const { oauth_token } = qs.parse(response.data);
    res.redirect(`https://connect.garmin.com/oauthConfirm?oauth_token=${oauth_token}`);
  } catch (err) {
    console.error("Error getting request token", err.response?.data || err.message);
    res.status(500).send("Failed to get request token");
  }
});

app.get("/oauth/callback", async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

  const accessParams = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token,
    oauth_verifier,
    oauth_version: "1.0"
  };

  accessParams.oauth_signature = getOAuthSignature(
    "POST",
    "https://connectapi.garmin.com/oauth-service/oauth/access_token",
    accessParams,
    CONSUMER_SECRET
  );

  try {
    const response = await axios.post(
      "https://connectapi.garmin.com/oauth-service/oauth/access_token",
      null,
      {
        headers: {
          Authorization: `OAuth ${Object.entries(accessParams).map(([k,v]) => `${k}="${encodeURIComponent(v)}"`).join(", ")}`
        }
      }
    );
    res.send(`<pre>✅ Tokenul de acces:<br>${response.data}</pre>`);
  } catch (err) {
    console.error("Error getting access token", err.response?.data || err.message);
    res.status(500).send("Eșec la obținerea access_token");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ Serverul OAuth1 ascultă pe portul", port));
