import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== CONFIG =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; // Put this in Vercel env vars
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // Your Discord log channel
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";

// ===== BASE TEST =====
app.get("/", (req, res) => {
  res.send("✅ Roblox Ban & Appeal Bot API is live!");
});

// ===== BAN HANDLER =====
app.post("/ban", async (req, res) => {
  const { username, userId, moderator, reason, duration } = req.body;
  console.log(`🔨 Ban received: ${username} (${userId})`);

  const embed = {
    title: "🔨 Player Banned",
    color: 0xffcc00,
    fields: [
      { name: "Player", value: `${username} (ID: ${userId})`, inline: true },
      { name: "Moderator", value: moderator, inline: true },
      { name: "Reason", value: reason || "No reason provided", inline: false },
      { name: "Duration", value: duration || "Permanent", inline: true },
    ],
    footer: { text: "Ban System" },
    timestamp: new Date(),
  };

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) throw new Error(`Discord API error: ${response.status}`);

    console.log("✅ Ban embed sent to Discord");
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error sending ban:", err);
    res.status(500).json({ error: "Failed to send ban to Discord" });
  }
});

// ===== APPEAL HANDLER =====
app.post("/appeal", async (req, res) => {
  const { username, userId, reason, banReason, moderator } = req.body;
  console.log(`📨 Appeal received: ${username} (${userId})`);

  const embed = {
    title: "📩 Ban Appeal Submitted",
    color: 0x00aaff,
    fields: [
      { name: "Player", value: `${username} (ID: ${userId})`, inline: true },
      { name: "Moderator Who Banned", value: moderator || "Unknown", inline: true },
      { name: "Ban Reason", value: banReason || "Unknown", inline: false },
      { name: "Player Appeal", value: reason || "No explanation given.", inline: false },
    ],
    footer: { text: "Appeal Review System" },
    timestamp: new Date(),
  };

  // Buttons for Accept/Decline
  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "✅ Accept Appeal",
          custom_id: `accept_${userId}`,
        },
        {
          type: 2,
          style: 4,
          label: "❌ Decline Appeal",
          custom_id: `decline_${userId}`,
        },
      ],
    },
  ];

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
        components: components,
      }),
    });

    if (!response.ok) throw new Error(`Discord API error: ${response.status}`);
    console.log("✅ Appeal sent to Discord for review");
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error sending appeal:", err);
    res.status(500).json({ error: "Failed to send appeal" });
  }
});

// ===== DISCORD INTERACTION HANDLER =====
app.post("/interactions", async (req, res) => {
  try {
    const body = req.body;
    const customId = body?.data?.custom_id;
    if (!customId) return res.status(400).send("Missing custom_id");

    const [action, userId] = customId.split("_");
    console.log(`🧩 Interaction: ${action} for ${userId}`);

    if (action === "accept") {
      // Unban player in Google Sheet
      await fetch(GOOGLE_SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban", userId }),
      });

      await followup(body, `✅ Appeal accepted — User ${userId} unbanned.`);
    } else if (action === "decline") {
      await followup(body, `❌ Appeal declined — User ${userId} remains banned.`);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Interaction handling error:", err);
    res.status(500).send("Internal error");
  }
});

async function followup(body, message) {
  const interactionToken = body.token;
  await fetch(`https://discord.com/api/v10/webhooks/${body.application_id}/${interactionToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}

// ===== START SERVER =====
app.listen(3000, () => console.log("🚀 Bot API running on port 3000"));
