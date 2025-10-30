import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { username, userId, reason, banReason, moderator } = req.body;

  const webhook = process.env.DISCORD_WEBHOOK_URL;

  const embed = {
    title: "📝 Appeal Submitted",
    color: 3447003,
    fields: [
      { name: "Player", value: `${username} (ID: ${userId})` },
      { name: "Original Reason", value: banReason || "N/A" },
      { name: "Appeal Reason", value: reason },
      { name: "Banned By", value: moderator || "Unknown" }
    ],
    footer: { text: "Ban Appeal System" },
    timestamp: new Date().toISOString()
  };

  const components = [{
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: "✅ Accept",
        custom_id: `accept_${userId}`
      },
      {
        type: 2,
        style: 4,
        label: "❌ Decline",
        custom_id: `decline_${userId}`
      }
    ]
  }];

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed], components })
  });

  return res.status(200).json({ ok: true });
}
