import fetch from "node-fetch";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { username, userId, reason, banReason, moderator } = req.body;

    // Validate input
    if (!username || !userId) {
      return res.status(400).json({ error: "Missing username or userId" });
    }

    console.log(`📝 Appeal submitted by ${username} (${userId})`);

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!botToken || !channelId) {
      console.error("Missing Discord credentials");
      return res.status(500).json({ error: "Missing Discord credentials" });
    }

    // Create Discord embed
    const embed = {
      title: "📝 Ban Appeal Submitted",
      color: 3447003, // Blue
      fields: [
        { name: "Player", value: `${username} (ID: ${userId})`, inline: true },
        { name: "Original Ban Reason", value: banReason || "N/A", inline: true },
        { name: "Banned By", value: moderator || "Unknown", inline: true },
        { name: "Appeal Reason", value: reason || "No reason provided", inline: false }
      ],
      footer: { text: "Ban Appeal System" },
      timestamp: new Date().toISOString()
    };

    // Add Accept/Decline buttons
    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success (green)
            label: "✅ Accept",
            custom_id: `accept_${userId}`
          },
          {
            type: 2, // Button
            style: 4, // Danger (red)
            label: "❌ Decline",
            custom_id: `decline_${userId}`
          }
        ]
      }
    ];

    // Send to Discord
    const discordResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          embeds: [embed],
          components: components
        })
      }
    );

    if (!discordResponse.ok) {
      const errText = await discordResponse.text();
      console.error("Discord API error:", errText);
      return res.status(discordResponse.status).json({ 
        error: "Failed to send to Discord",
        details: errText 
      });
    }

    const discordData = await discordResponse.json();
    console.log(`✅ Appeal sent to Discord (Message ID: ${discordData.id})`);

    return res.status(200).json({ 
      success: true,
      message: "Appeal submitted successfully",
      messageId: discordData.id
    });

  } catch (err) {
    console.error("❌ Appeal submission error:", err);
    return res.status(500).json({ 
      error: "Failed to submit appeal",
      details: err.message 
    });
  }
}
