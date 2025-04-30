const express = require("express");
const axios = require("axios");
const oauth1a = require("oauth-1.0a");
const crypto = require("crypto");
const qs = require("querystring");

const app = express();
const tempSecrets = {};

const CONSUMER_KEY = "37582612-90de-4a8c-a51b-cc6d4883522e";
const CONSUMER_SECRET = "hVS569gvgDAC0FoslF76pnFxomNFySkxNPD";
const CALLBACK_URL = "https://ecotech-oauth.onrender.com/oauth-callback.html";

const oauth = oauth1a({
  consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
  signature_method: "HMAC-SHA1",
  hash_function(base, key) {
    return crypto.createHmac("sha1", key).update(base).digest("base64");
  },
});

app.get("/", (req, res) => {
  res.send("✅ Ecotech OAuth1 server running.");
});

app.get("/oauth/start", async (req, res) => {
  const request_data = {
    url: "https://connectapi.garmin.com/oauth-service/oauth/request_token",
    method: "POST",
    data: { oauth_callback: CALLBACK_URL },
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(request_data));
    const response = await axios.post(
      request_data.url,
      qs.stringify({ oauth_callback: CALLBACK_URL }),
      { headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const respData = qs.parse(response.data);
    tempSecrets[respData.oauth_token] = respData.oauth_token_secret;
    res.redirect(`https://connect.garmin.com/oauthConfirm?oauth_token=${respData.oauth_token}`);
  } catch (err) {
    console.error("❌ Failed to get request token:", err.response?.data || err.message);
    res.send("Failed to get request token");
  }
});

app.get("/oauth-callback.html", (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  res.redirect(`/oauth/callback?${query}`);
});

app.get("/oauth/callback", async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  if (!oauth_token || !oauth_verifier) return res.status(400).send("Missing token or verifier");

  const token_secret = tempSecrets[oauth_token];
  if (!token_secret) return res.status(400).send("Missing token secret");

  const request_data = {
    url: "https://connectapi.garmin.com/oauth-service/oauth/access_token",
    method: "POST",
    data: { oauth_token, oauth_verifier },
  };

  try {
    const token = { key: oauth_token, secret: token_secret };
    const headers = oauth.toHeader(oauth.authorize(request_data, token));

    const response = await axios.post(
      request_data.url,
      qs.stringify({ oauth_token, oauth_verifier }),
      { headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const finalData = qs.parse(response.data);
    const redirectUrl = `/garmin/test?oauth_token=${finalData.oauth_token}&oauth_token_secret=${finalData.oauth_token_secret}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("❌ Failed to get access token:", err.response?.data || err.message);
    res.send("Failed to get access token");
  }
});

app.get("/garmin/test", async (req, res) => {
  const { oauth_token, oauth_token_secret } = req.query;
  if (!oauth_token || !oauth_token_secret) return res.status(400).send("Missing tokens");

  const token = { key: oauth_token, secret: oauth_token_secret };

  const request_data = {
    url: "https://apis.garmin.com/wellness-api/rest/user/id",
    method: "GET",
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(request_data, token));
    const response = await axios.get(request_data.url, { headers });
    const userId = response.data.userId;

    const today = new Date().toISOString().split("T")[0];
    const btnLink = `/garmin/data?oauth_token=${oauth_token}&oauth_token_secret=${oauth_token_secret}&date=${today}&type=dailies`;

    res.send(`
      <h2>✅ SUCCESS</h2>
      <pre>${JSON.stringify({ userId }, null, 2)}</pre>
      <p><b>NOTĂ:</b> pentru a cere datele de sănătate, trebuie autorizări suplimentare și parametri (ex: dată, tip date).</p>
      <a href="${btnLink}">
        <button style="font-size:1.5rem;padding:1rem;border-radius:8px">🔍 Vezi pașii de azi</button>
      </a>
    `);
  } catch (err) {
    console.error("❌ Failed to fetch Garmin user ID:", err.response?.data || err.message);
    res.send("Failed to fetch Garmin data");
  }
});

app.get("/garmin/data", async (req, res) => {
  const { oauth_token, oauth_token_secret, date, type } = req.query;
  if (!oauth_token || !oauth_token_secret || !date || !type)
    return res.status(400).send("Missing token, date, or type");

  const token = { key: oauth_token, secret: oauth_token_secret };

  const endpointMap = {
    dailies: `https://apis.garmin.com/wellness-api/rest/dailies/${date}`,
    heartRate: `https://apis.garmin.com/wellness-api/rest/heartRate?startTimeInSeconds=${Math.floor(new Date(date).getTime() / 1000)}`,
    sleep: `https://apis.garmin.com/wellness-api/rest/sleepData/${date}`,
  };

  const url = endpointMap[type];
  if (!url) return res.status(400).send("Invalid data type");

  const request_data = {
    url,
    method: "GET",
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(request_data, token));
    const response = await axios.get(request_data.url, { headers });

    res.send(`
      <h2>✅ ${type} data for ${date}</h2>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
    `);
  } catch (err) {
    console.error("❌ Failed to fetch Garmin data:", err.response?.data || err.message);
    res.send("Failed to fetch Garmin data");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("✅ Server running on port", port);
});
