export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  // Get data from request body
  const { username, userId, moderator, reason, duration } = req.body;
  
  // Get environment variables
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  // Check if credentials exist
  if (!botToken || !channelId) {
    return res.status(500).json({ error: "Missing Discord credentials" });
  }

  // Log the ban
  console.log(`🔨 Ban received: ${username} (${userId})`);

  // Create Discord embed
  const embed = {
    title: "🔨 Player Banned",
    color: 0xffcc00,
    fields: [
      { name: "Player", value: `${username} (ID: ${userId})`, inline: true },
      { name: "Moderator", value: moderator || "Unknown", inline: true },
      { name: "Reason", value: reason || "No reason provided", inline: false },
      { name: "Duration", value: duration || "Permanent", inline: true },
    ],
    footer: { text: "Ban System" },
    timestamp: new Date().toISOString(),
  };

  try {
    // Send to Discord
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      }
    );

    // Check if Discord request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Discord API error:", errorText);
      return res.status(response.status).json({ error: errorText });
    }

    console.log("✅ Ban embed sent to Discord");
    return res.json({ success: true });

  } catch (err) {
    console.error("❌ Error sending ban:", err);
    return res.status(500).json({ error: "Failed to send ban to Discord" });
  }
}
