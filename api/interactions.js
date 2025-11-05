import nacl from "tweetnacl";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    console.error("Missing signature, timestamp, or public key");
    return res.status(401).json({ error: "Missing headers" });
  }

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

  try {
    const { type, data, message, token, member, application_id } = req.body;

    if (type === 1) {
      return res.status(200).json({ type: 1 });
    }

    if (type === 3) {
      const customId = data?.custom_id || "";
      const [action, userId] = customId.split("_");

      // Respond immediately to prevent timeout
      res.status(200).json({ type: 6 });

      // Process in background
      setImmediate(() => {
        handleButton(action, userId, application_id, token, message, member);
      });
      
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
      // Unban from sheet - AWAIT THIS!
      const sheetResponse = await fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban", userId }),
      });

      if (!sheetResponse.ok) {
        console.error("Sheet unban failed:", await sheetResponse.text());
      }

      // Unban from Roblox - FIX: Use DELETE method, not PATCH
      if (robloxKey && universeId) {
        try {
          const robloxResponse = await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            { 
              method: "DELETE", // ✅ FIXED: Changed from PATCH to DELETE
              headers: { 
                "x-api-key": robloxKey
              }
            }
          );

          if (!robloxResponse.ok) {
            const errorText = await robloxResponse.text();
            console.error("Roblox unban failed:", errorText);
            
            const embed = {
              ...message.embeds[0],
              title: "⚠️ Appeal Accepted (Roblox Unban Failed)",
              color: 16776960,
              fields: [
                ...message.embeds[0].fields,
                { name: "Status", value: `Accepted by <@${member.user.id}>` },
                { name: "Error", value: "Failed to unban from Roblox. Please unban manually." }
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
            return;
          }

          console.log(`✅ Successfully unbanned user ${userId} from Roblox`);
        } catch (robloxError) {
          console.error("Roblox API error:", robloxError);
          
          const embed = {
            ...message.embeds[0],
            title: "⚠️ Appeal Accepted (Roblox Error)",
            color: 16776960,
            fields: [
              ...message.embeds[0].fields,
              { name: "Status", value: `Accepted by <@${member.user.id}>` },
              { name: "Error", value: "Could not connect to Roblox API. Please unban manually." }
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
          return;
        }
      } else {
        console.warn("Missing ROBLOX_API_KEY or ROBLOX_UNIVERSE_ID");
      }

      // Update embed on success
      const embed = {
        ...message.embeds[0],
        title: "✅ Appeal Accepted",
        color: 3066993,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Accepted by <@${member.user.id}>` },
          { name: "Roblox", value: "✅ Player unbanned successfully" }
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
    console.error("Button handler error:", err);
    
    try {
      const embed = {
        ...message.embeds[0],
        title: "❌ Error Processing Appeal",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Error", value: "An error occurred. Please try again or process manually." }
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
    } catch (updateError) {
      console.error("Failed to update message with error:", updateError);
    }
  }
}
