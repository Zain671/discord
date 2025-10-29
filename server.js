import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const DISCORD_BOT_TOKEN = process.env.MTQzMzE2ODIxNzQ0MjA5MTIyOQ.G6qTnM.QRWCdbyCksH_lpmLT4QS1BG6Se6Q7GdwB_8ywE;
const DISCORD_CHANNEL_ID = process.env.1433106499772747879;

app.get("/", (req, res) => res.send("✅ Roblox Discord bot is online."));

app.post("/ban", async (req, res) => {
  const { username, userId, moderator, reason, duration } = req.body;

  const message = {
    embeds: [{
      title: "🔨 Player Banned",
      color: 16776960,
      fields: [
        { name: "Player", value: `${username} (ID: ${userId})` },
        { name: "Moderator", value: moderator },
        { name: "Reason", value: reason },
        { name: "Duration", value: duration || "Permanent" }
      ],
      footer: { text: "Ban System" }
    }]
  };

  try {
    await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

app.listen(3000, () => console.log("Bot API running"));
