import fetch from "node-fetch";

export default async function handler(req, res) {
  const { type, data, message, token, member, application_id } = req.body;

  // Discord PING - must respond with type 1
  if (type === 1) {
    return res.json({ type: 1 });
  }

  // Button interaction
  if (type === 3) {
    const customId = data.custom_id;
    const [action, userId] = customId.split("_");

    // ✅ RESPOND IMMEDIATELY - This is critical!
    res.status(200).json({
      type: 5, // Deferred response
    });

    // Now do everything else asynchronously
    const appId = application_id || process.env.DISCORD_APPLICATION_ID;
    const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
    const robloxApiKey = process.env.ROBLOX_API_KEY;
    const universeId = process.env.ROBLOX_UNIVERSE_ID;

    // Do NOT await this - let it run in background
    processInteraction(action, userId, appId, token, message, member, sheetUrl, robloxApiKey, universeId);
    
    return; // Exit immediately after sending response
  }

  return res.status(400).json({ error: "Unknown interaction type" });
}

// Separate async function to process in background
async function processInteraction(action, userId, appId, token, message, member, sheetUrl, robloxApiKey, universeId) {
  try {
    if (action === "accept") {
      let results = {
        sheet: { success: false, error: null },
        roblox: { success: false, error: null }
      };

      // 1. Unban from Google Sheet
      try {
        const sheetResponse = await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unban",
            userId: userId,
          }),
        });

        const sheetData = await sheetResponse.json();
        results.sheet.success = sheetData.success === true;
        results.sheet.error = sheetData.error || sheetData.message;
        console.log("Sheet result:", sheetData);
      } catch (err) {
        results.sheet.error = err.message;
        console.error("Sheet error:", err);
      }

      // 2. Unban from Roblox
      if (robloxApiKey && universeId) {
        try {
          const robloxResponse = await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            {
              method: "DELETE",
              headers: {
                "x-api-key": robloxApiKey,
              },
            }
          );

          results.roblox.success = robloxResponse.ok;
          if (!robloxResponse.ok) {
            results.roblox.error = await robloxResponse.text();
          }
          console.log("Roblox unban:", robloxResponse.status);
        } catch (err) {
          results.roblox.error = err.message;
          console.error("Roblox error:", err);
        }
      }

      // 3. Update Discord message
      const embed = message.embeds[0];
      embed.title = "✅ Appeal Accepted";
      embed.color = 3066993;

      let statusText = `Accepted by <@${member.user.id}>\n`;
      statusText += results.sheet.success ? "✅ Removed from spreadsheet\n" : `❌ Spreadsheet: ${results.sheet.error || "Failed"}\n`;
      statusText += results.roblox.success ? "✅ Unbanned from Roblox" : (robloxApiKey ? `⚠️ Roblox: ${results.roblox.error || "Failed"}` : "⚠️ Roblox unban not configured");

      embed.fields.push({
        name: "Status",
        value: statusText,
      });

      // Update the original message
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [embed],
            components: [],
          }),
        }
      );

      // Send follow-up
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `✅ Appeal processed for user ${userId}.`,
            flags: 64,
          }),
        }
      );

    } else if (action === "decline") {
      // Update message
      const embed = message.embeds[0];
      embed.title = "❌ Appeal Declined";
      embed.color = 15158332;
      embed.fields.push({
        name: "Status",
        value: `Declined by <@${member.user.id}>\n❌ User remains banned`,
      });

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [embed],
            components: [],
          }),
        }
      );

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `❌ Appeal declined for user ${userId}.`,
            flags: 64,
          }),
        }
      );
    }
  } catch (err) {
    console.error("Fatal error:", err);
    
    // Try to send error message
    try {
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `❌ Error: ${err.message}`,
            flags: 64,
          }),
        }
      );
    } catch (webhookErr) {
      console.error("Webhook error:", webhookErr);
    }
  }
}
