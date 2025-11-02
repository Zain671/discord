import nacl from "tweetnacl";

export default async function handler(req, res) {
  // Set headers
  res.setHeader("Content-Type", "application/json");

  // Handle OPTIONS
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Get signature headers
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  // Verify signature
  if (signature && timestamp && publicKey) {
    try {
      const body = JSON.stringify(req.body);
      const isValid = nacl.sign.detached.verify(
        Buffer.from(timestamp + body),
        Buffer.from(signature, "hex"),
        Buffer.from(publicKey, "hex")
      );

      if (!isValid) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    } catch (err) {
      console.error("Signature verification failed:", err);
      res.status(401).json({ error: "Verification failed" });
      return;
    }
  }

  // Get interaction data
  const interaction = req.body;
  const type = interaction.type;

  // PING
  if (type === 1) {
    res.status(200).json({ type: 1 });
    return;
  }

  // Button click
  if (type === 3) {
    const customId = interaction.data.custom_id;
    const parts = customId.split("_");
    const action = parts[0];
    const userId = parts[1];

    // Respond immediately
    res.status(200).json({ type: 5 });

    // Process button in background
    setTimeout(() => {
      processButton(
        action,
        userId,
        interaction.application_id,
        interaction.token,
        interaction.message,
        interaction.member
      ).catch(err => {
        console.error("Background processing error:", err);
      });
    }, 0);

    return;
  }

  // Unknown type
  res.status(400).json({ error: "Unknown interaction type" });
}

async function processButton(action, userId, appId, token, message, member) {
  const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";

  try {
    if (action === "accept") {
      // Unban from spreadsheet
      try {
        await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unban",
            userId: userId
          })
        });
      } catch (e) {
        console.error("Sheet error:", e);
      }

      // Unban from Roblox (optional)
      const robloxKey = process.env.ROBLOX_API_KEY;
      const universeId = process.env.ROBLOX_UNIVERSE_ID;
      if (robloxKey && universeId) {
        try {
          await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            {
              method: "DELETE",
              headers: { "x-api-key": robloxKey }
            }
          );
        } catch (e) {
          console.error("Roblox error:", e);
        }
      }

      // Build new embed
      const oldEmbed = message.embeds[0];
      const newEmbed = {
        title: "✅ Appeal Accepted",
        color: 3066993,
        fields: oldEmbed.fields.concat([
          {
            name: "Status",
            value: "Accepted by <@" + member.user.id + ">"
          }
        ])
      };

      if (oldEmbed.description) newEmbed.description = oldEmbed.description;
      if (oldEmbed.footer) newEmbed.footer = oldEmbed.footer;
      if (oldEmbed.timestamp) newEmbed.timestamp = oldEmbed.timestamp;

      // Update message
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [newEmbed],
            components: []
          })
        }
      );

      // Send confirmation
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `✅ User ${userId} has been unbanned.`
          })
        }
      );

    } else if (action === "decline") {
      // Build new embed
      const oldEmbed = message.embeds[0];
      const newEmbed = {
        title: "❌ Appeal Declined",
        color: 15158332,
        fields: oldEmbed.fields.concat([
          {
            name: "Status",
            value: "Declined by <@" + member.user.id + ">"
          }
        ])
      };

      if (oldEmbed.description) newEmbed.description = oldEmbed.description;
      if (oldEmbed.footer) newEmbed.footer = oldEmbed.footer;
      if (oldEmbed.timestamp) newEmbed.timestamp = oldEmbed.timestamp;

      // Update message
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [newEmbed],
            components: []
          })
        }
      );

      // Send confirmation
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `❌ Appeal declined for user ${userId}.`
          })
        }
      );
    }

  } catch (err) {
    console.error("Process button error:", err);
  }
}
