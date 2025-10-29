import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

app.get("/", (req, res) => res.send("✅ Roblox Discord bot is online."));

app.post("/ban", async (req, res) => {
  const { username, userId, moderator, reason, duration } = req.body;

  const message = {
    embeds: [
      {
        title: "🔨 Player Banned",
        color: 16776960,
        fields: [
          { name: "Player", value: `${username} (ID: ${userId})` },
          { name: "Moderator", value: moderator },
          { name: "Reason", value: reason },
          { name: "Duration", value: duration || "Permanent" },
        ],
        footer: { text: "Ban System" },
      },
    ],
  };

  try {
    await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Discord error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

async function setBotStatus() {
  try {
    await fetch("https://discord.com/api/v10/users/@me/settings", {
      method: "PATCH",
      headers: {
        "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "online", 
        custom_status: { text: "Watching Roblox bans 👀" },
      }),
    });
    console.log("✅ Bot status set to online.");
  } catch (error) {
    console.error("❌ Failed to set bot status:", error);
  }
}

app.listen(3000, async () => {
  console.log("Bot API running on port 3000");
  await setBotStatus();
});
