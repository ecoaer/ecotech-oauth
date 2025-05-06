const express = require("express");
const axios = require("axios");
const OAuth = require("oauth-1.0a");
const crypto = require("crypto");
const qs = require("querystring");

const app = express();
const tempSecrets = {}; // Temporary storage for token secrets (consider Redis for production)

const CONSUMER_KEY = "37582612-90de-4a8c-a51b-cc6d4883522e";
const CONSUMER_SECRET = "hVS569gvgDAC0FoslF76pnFxomNFySkxNPD";
const CALLBACK_URL = "https://ecotech-oauth.onrender.com/oauth-callback.html";

const oauth = OAuth({
  consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
  signature_method: "HMAC-SHA1",
  hash_function(base, key) {
    return crypto.createHmac("sha1", key).update(base).digest("base64");
  },
});

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Root endpoint with a button to start OAuth flow
app.get("/", (req, res) => {
  res.send(`
    <h2>Ecotech Databridge</h2>
    <p>✅ Ecotech OAuth1 server running.</p>
    <p>Connect your Garmin account to fetch wellness data (steps, heart rate, sleep, etc.).</p>
    <a href="/oauth/start">
      <button style="font-size: 18px; padding: 10px; background-color: #4CAF50; color: white; border: none; cursor: pointer;">
        Connect with Garmin
      </button>
    </a>
  `);
});

// Start OAuth flow: Request temporary token
app.get("/oauth/start", async (req, res) => {
  const requestData = {
    url: "https://connectapi.garmin.com/oauth-service/oauth/request_token",
    method: "POST",
    data: { oauth_callbackنج: CALLBACK_URL },
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(requestData));
    const response = await axios.post(
      requestData.url,
      qs.stringify({ oauth_callback: CALLBACK_URL }),
      { headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const respData = qs.parse(response.data);
    tempSecrets[respData.oauth_token] = respData.oauth_token_secret;
    res.redirect(`https://connect.garmin.com/oauthConfirm?oauth_token=${respData.oauth_token}`);
  } catch (err) {
    const errorMessage = err.response?.data?.errorMessage || err.message;
    console.error("❌ Failed to get request token:", errorMessage);
    res.status(500).send(`
      <h2 style="color:red">❌ Failed to get request token</h2>
      <p><b>Error:</b> ${errorMessage}</p>
      <a href="/">Back to Home</a>
    `);
  }
});

// OAuth callback HTML redirect
app.get("/oauth-callback.html", (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  res.redirect(`/oauth/callback?${query}`);
});

// Exchange temporary token for access token
app.get("/oauth/callback", async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  if (!oauth_token || !oauth_verifier) {
    return res.status(400).send("Missing oauth_token or oauth_verifier");
  }

  const tokenSecret = tempSecrets[oauth_token];
  if (!tokenSecret) {
    return res.status(400).send("Invalid or expired oauth_token");
  }

  const requestData = {
    url: "https://connectapi.garmin.com/oauth-service/oauth/access_token",
    method: "POST",
    data: { oauth_token, oauth_verifier },
  };

  try {
    const token = { key: oauth_token, secret: tokenSecret };
    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await axios.post(
      requestData.url,
      qs.stringify({ oauth_token, oauth_verifier }),
      { headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const finalData = qs.parse(response.data);
    const redirectUrl = `/garmin/test?oauth_token=${finalData.oauth_token}&oauth_token_secret=${finalData.oauth_token_secret}`;
    res.redirect(redirectUrl);
  } catch (err) {
    const errorMessage = err.response?.data?.errorMessage || err.message;
    console.error("❌ Failed to get access token:", errorMessage);
    res.status(500).send(`
      <h2 style="color:red">❌ Failed to get access token</h2>
      <p><b>Error:</b> ${errorMessage}</p>
      <a href="/">Back to Home</a>
    `);
  }
});

// Test endpoint: Fetch user ID and provide data query form
app.get("/garmin/test", async (req, res) => {
  const { oauth_token, oauth_token_secret } = req.query;
  if (!oauth_token || !oauth_token_secret) {
    return res.status(400).send("Missing oauth_token or oauth_token_secret");
  }

  const token = { key: oauth_token, secret: oauth_token_secret };
  const requestData = {
    url: "https://apis.garmin.com/wellness-api/rest/user/id",
    method: "GET",
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await axios.get(requestData.url, { headers });
    const userId = response.data.userId;

    res.send(`
      <h2>✅ Authentication Successful</h2>
      <pre>User ID: ${JSON.stringify({ userId }, null, 2)}</pre>
      <p><b>Select data type and date to query Garmin Wellness API:</b></p>
      <form action="/garmin/data" method="get">
        <input type="hidden" name="oauth_token" value="${oauth_token}" />
        <input type="hidden" name="oauth_token_secret" value="${oauth_token_secret}" />
        <label for="date">Date (YYYY-MM-DD):</label>
        <input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" required /><br><br>
        <label for="type">Data Type:</label>
        <select name="type" required>
          <option value="dailies">Steps (Dailies)</option>
          <option value="heartRate">Heart Rate</option>
          <option value="sleep">Sleep Data</option>
        </select><br><br>
        <button type="submit" style="font-size: 18px; padding: 10px;">🔍 Fetch Data</button>
      </form>
      <br>
      <a href="/">Back to Home</a>
    `);
  } catch (err) {
    const errorMessage = err.response?.data?.errorMessage || err.message;
    const statusCode = err.response?.status || 500;
    console.error("❌ Failed to fetch user ID:", errorMessage, `Status: ${statusCode}`);
    res.status(statusCode).send(`
      <h2 style="color:red">❌ Failed to fetch user ID</h2>
      <p><b>Error:</b> ${errorMessage}</p>
      <p><b>Status:</b> ${statusCode}</p>
      <a href="/">Back to Home</a>
    `);
  }
});

// Fetch specific Garmin data (dailies, heartRate, sleep)
app.get("/garmin/data", async (req, res) => {
  const { oauth_token, oauth_token_secret, date, type } = req.query;
  if (!oauth_token || !oauth_token_secret || !date || !type) {
    return res.status(400).send("Missing oauth_token, oauth_token_secret, date, or type");
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).send("Invalid date format (use YYYY-MM-DD)");
  }

  // Validate data type
  const validTypes = ["dailies", "heartRate", "sleep"];
  if (!validTypes.includes(type)) {
    return res.status(400).send(`Invalid data type. Use one of: ${validTypes.join(", ")}`);
  }

  const token = { key: oauth_token, secret: oauth_token_secret };
  let startTime, endTime;

  // Adjust time range for sleep data (10 PM to 8 AM next day)
  if (type === "sleep") {
    startTime = Math.floor(new Date(date + "T22:00:00").getTime() / 1000); // 10 PM on the selected date
    endTime = Math.floor(new Date(date + "T08:00:00").getTime() / 1000) + 86400; // 8 AM the next day
  } else {
    startTime = Math.floor(new Date(date).getTime() / 1000); // Start of the day
    endTime = startTime + 86400; // End of the day (24 hours later)
  }

  const endpointMap = {
    dailies: `https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=${startTime}&uploadEndTimeInSeconds=${endTime}`,
    heartRate: `https://apis.garmin.com/wellness-api/rest/heartRate?startTimeInSeconds=${startTime}&endTimeInSeconds=${endTime}`,
    sleep: `https://apis.garmin.com/wellness-api/rest/sleepData?startTimeInSeconds=${startTime}&endTimeInSeconds=${endTime}`,
  };

  const requestData = {
    url: endpointMap[type],
    method: "GET",
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await axios.get(requestData.url, { headers });
    console.log(`API response for ${type}:`, response.data);

    res.send(`
      <h2>✅ ${type} Data for ${date}</h2>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
      <a href="/garmin/test?oauth_token=${oauth_token}&oauth_token_secret=${oauth_token_secret}">Back to Test</a>
    `);
  } catch (err) {
    const errorMessage = err.response?.data?.errorMessage || err.message;
    const statusCode = err.response?.status || 500;
    console.error(`❌ Failed to fetch ${type} data:`, errorMessage, `Status: ${statusCode}`);
    let helpMessage = "";
    if (type === "sleep" && statusCode === 404) {
      helpMessage = `
        <p><b>Help:</b> This error usually means no sleep data is available for the selected date. Please try the following:</p>
        <ul>
          <li>Ensure your Garmin device has synced sleep data for this date in Garmin Connect.</li>
          <li>Check if the app has permission to access Sleep Data in Garmin Connect > Connected Apps.</li>
          <li>Try a different date (e.g., a recent night when you wore your device).</li>
        </ul>
      `;
    }
    res.status(statusCode).send(`
      <h2 style="color:red">❌ Failed to fetch ${type} data</h2>
      <p><b>Error:</b> ${errorMessage}</p>
      <p><b>Status:</b> ${statusCode}</p>
      ${helpMessage}
      <a href="/garmin/test?oauth_token=${oauth_token}&oauth_token_secret=${oauth_token_secret}">Back to Test</a>
    `);
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
