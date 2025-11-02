import nacl from "tweetnacl";

export default async function handler(req, res) {
  // Set response headers
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get Discord signature headers
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    console.error("Missing signature, timestamp, or public key");
    return res.status(401).json({ error: "Missing headers" });
  }

  // Verify the request signature
  try {
    const body = JSON.stringify(req.body);
    const isValid = nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );

    if (!isValid) {
      console.error("Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } catch (err) {
    console.error("Signature verification error:", err);
    return res.status(401).json({ error: "Verification failed" });
  }

  // Process the interaction
  try {
    const { type, data, message, token, member, application_id } = req.body;

    // Discord PING
    if (type === 1) {
      return res.status(200).json({ type: 1 });
    }

    // Button interaction
    if (type === 3) {
      const customId = data?.custom_id || "";
      const [action, userId] = customId.split("_");

      // Respond immediately
      res.status(200).json({ type: 5 });

      // Process in background
      handleButton(action, userId, application_id, token, message, member);
      return;
    }

    return res.status(400).json({ error: "Unknown type" });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleButton(action, userId, appId, token, message, member) {
  const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
  const robloxKey = process.env.ROBLOX_API_KEY;
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  try {
    if (action === "accept") {
      // Unban from sheet
      await fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban", userId }),
      });

      // Unban from Roblox
      if (robloxKey && universeId) {
        await fetch(
          `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
          { method: "DELETE", headers: { "x-api-key": robloxKey } }
        );
      }

      // Update embed
      const embed = {
        ...message.embeds[0],
        title: "✅ Appeal Accepted",
        color: 3066993,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Accepted by <@${member.user.id}>` }
        ]
      };

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed], components: [] }),
        }
      );

    } else if (action === "decline") {
      const embed = {
        ...message.embeds[0],
        title: "❌ Appeal Declined",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Declined by <@${member.user.id}>` }
        ]
      };

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed], components: [] }),
        }
      );
    }
  } catch (err) {
    console.error("Button error:", err);
  }
}
