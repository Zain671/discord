import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { username, userId, reason, banReason, moderator } = req.body;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID; // Add this in Vercel too!

  if (!botToken || !channelId) {
    return res.status(500).json({ error: "Missing Discord credentials" });
  }

  const embed = {
    title: "📝 Appeal Submitted",
    color: 3447003,
    fields: [
      { name: "Player", value: `${username} (ID: ${userId})` },
      { name: "Original Ban Reason", value: banReason || "N/A" },
      { name: "Appeal Reason", value: reason || "No reason provided" },
      { name: "Banned By", value: moderator || "Unknown" },
    ],
    footer: { text: "Ban Appeal System" },
    timestamp: new Date().toISOString(),
  };

  const components = [
    {
      type: 1, // action row
      components: [
        {
          type: 2,
          style: 3, // green
          label: "✅ Accept",
          custom_id: `accept_${userId}`,
        },
        {
          type: 2,
          style: 4, // red
          label: "❌ Decline",
          custom_id: `decline_${userId}`,
        },
      ],
    },
  ];

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
        components,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Discord API error:", errText);
      return res.status(response.status).json({ error: errText });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to send message" });
  }
}
