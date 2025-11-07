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

      console.log(`🔵 Button clicked: ${action} for user ${userId}`);

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

  console.log(`🔵 Starting ${action} for user ${userId}`);

  try {
    if (action === "accept") {
      // ===== STEP 1: UNBAN FROM SHEET =====
      console.log(`📊 Removing user ${userId} from spreadsheet...`);
      
      try {
        const sheetResponse = await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "unban", 
            userId: String(userId) // Ensure it's a string
          }),
        });

        const sheetData = await sheetResponse.json();
        console.log(`📊 Sheet response:`, sheetData);

        if (!sheetResponse.ok || !sheetData.success) {
          console.error("❌ Sheet unban failed:", sheetData);
          throw new Error("Failed to remove from spreadsheet");
        }

        console.log(`✅ Successfully removed user ${userId} from spreadsheet`);
      } catch (sheetError) {
        console.error("❌ Sheet error:", sheetError);
        
        // Update Discord with sheet error
        const embed = {
          ...message.embeds[0],
          title: "⚠️ Error Removing from Spreadsheet",
          color: 16776960,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Attempted by <@${member.user.id}>` },
            { name: "Error", value: "Could not remove from spreadsheet. Check logs." }
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

      // ===== STEP 2: UNBAN FROM ROBLOX =====
      let robloxSuccess = false;
      let robloxError = null;

      if (robloxKey && universeId) {
        console.log(`🎮 Unbanning user ${userId} from Roblox...`);
        
        try {
          // Roblox Cloud API - DELETE removes the user restriction
          const robloxResponse = await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            { 
              method: "DELETE",
              headers: { 
                "x-api-key": robloxKey
              }
            }
          );

          console.log(`🎮 Roblox response status: ${robloxResponse.status}`);

          if (robloxResponse.status === 200 || robloxResponse.status === 204) {
            console.log(`✅ Successfully unbanned user ${userId} from Roblox`);
            robloxSuccess = true;
          } else if (robloxResponse.status === 404) {
            // User wasn't banned in Roblox (might have been manual unban)
            console.log(`⚠️ User ${userId} was not found in Roblox bans (already unbanned?)`);
            robloxSuccess = true; // Still count as success
          } else {
            const errorText = await robloxResponse.text();
            console.error(`❌ Roblox unban failed (${robloxResponse.status}):`, errorText);
            robloxError = `Status ${robloxResponse.status}: ${errorText}`;
          }
        } catch (robloxErr) {
          console.error("❌ Roblox API error:", robloxErr);
          robloxError = robloxErr.message;
        }
      } else {
        console.warn("⚠️ Missing ROBLOX_API_KEY or ROBLOX_UNIVERSE_ID");
        robloxError = "Missing Roblox credentials";
      }

      // ===== STEP 3: UPDATE DISCORD EMBED =====
      let embed;
      
      if (robloxSuccess) {
        // Full success
        embed = {
          ...message.embeds[0],
          title: "✅ Appeal Accepted",
          color: 3066993, // Green
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: "✅ Removed successfully" },
            { name: "Roblox", value: "✅ Player unbanned successfully" }
          ]
        };
      } else {
        // Sheet success but Roblox failed
        embed = {
          ...message.embeds[0],
          title: "⚠️ Partial Success",
          color: 16776960, // Yellow
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: "✅ Removed successfully" },
            { name: "Roblox", value: `❌ Failed to unban\n${robloxError || "Unknown error"}` }
          ]
        };
      }

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed], components: [] }),
        }
      );

      console.log(`✅ Discord embed updated for user ${userId}`);

    } else if (action === "decline") {
      console.log(`❌ Declining appeal for user ${userId}`);
      
      const embed = {
        ...message.embeds[0],
        title: "❌ Appeal Declined",
        color: 15158332, // Red
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

      console.log(`✅ Appeal declined for user ${userId}`);
    }
  } catch (err) {
    console.error("❌ Button handler error:", err);
    
    try {
      const embed = {
        ...message.embeds[0],
        title: "❌ Error Processing Appeal",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Error", value: `An error occurred: ${err.message}` }
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
      console.error("❌ Failed to update message with error:", updateError);
    }
  }
}
