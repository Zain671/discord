import fetch from "node-fetch";

export default async function handler(req, res) {
  const { type, data, message, token, member, application_id } = req.body;

  // Discord PING
  if (type === 1) {
    return res.json({ type: 1 });
  }

  // Button interaction
  if (type === 3) {
    const customId = data.custom_id;
    const [action, userId] = customId.split("_");

    // ✅ RESPOND IMMEDIATELY with "thinking" state
    res.json({
      type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    // Now process in background
    const appId = application_id || process.env.DISCORD_APPLICATION_ID;
    const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
    const robloxApiKey = process.env.ROBLOX_API_KEY;
    const universeId = process.env.ROBLOX_UNIVERSE_ID;

    // Process the action asynchronously
    (async () => {
      try {
        if (action === "accept") {
          let sheetSuccess = false;
          let robloxSuccess = false;
          let errors = [];

          // 1. Remove from Google Sheet
          try {
            const sheetResponse = await fetch(sheetUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "unban",
                userId: userId,
              }),
            });

            const sheetResult = await sheetResponse.json();
            console.log("Sheet unban result:", sheetResult);
            sheetSuccess = sheetResult.success;
            
            if (!sheetSuccess) {
              errors.push("Spreadsheet: " + (sheetResult.message || "Unknown error"));
            }
          } catch (sheetErr) {
            console.error("Sheet error:", sheetErr);
            errors.push("Spreadsheet: " + sheetErr.message);
          }

          // 2. Unban from Roblox using OpenCloud API
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

            if (robloxResponse.ok) {
              console.log("✅ Successfully unbanned from Roblox");
              robloxSuccess = true;
            } else {
              const errorText = await robloxResponse.text();
              console.warn("⚠️ Roblox unban failed:", errorText);
              errors.push("Roblox: " + errorText);
            }
          } catch (robloxErr) {
            console.error("❌ Roblox API error:", robloxErr);
            errors.push("Roblox: " + robloxErr.message);
          }

          // 3. Update Discord message
          const embed = message.embeds[0];
          embed.title = "✅ Appeal Accepted";
          embed.color = 3066993;
          
          let statusText = `Accepted by <@${member.user.id}>\n`;
          statusText += sheetSuccess ? "✅ Removed from spreadsheet\n" : "❌ Failed to remove from spreadsheet\n";
          statusText += robloxSuccess ? "✅ Unbanned from Roblox" : "⚠️ Roblox unban status unknown";
          
          if (errors.length > 0) {
            statusText += "\n\n**Errors:**\n" + errors.join("\n");
          }

          embed.fields.push({
            name: "Status",
            value: statusText,
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

          // Send follow-up message
          await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: sheetSuccess || robloxSuccess 
                  ? `✅ Appeal accepted! User ${userId} has been unbanned.`
                  : `⚠️ Appeal accepted but encountered errors. Check the embed above.`,
                flags: 64,
              }),
            }
          );

        } else if (action === "decline") {
          // Update the Discord message
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

          // Send follow-up message
          await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: `❌ Appeal declined for user ${userId}. Ban remains active.`,
                flags: 64,
              }),
            }
          );
        }
      } catch (err) {
        console.error("Fatal error in background processing:", err);
        
        // Try to send error message
        try {
          await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: `❌ Critical error processing appeal: ${err.message}`,
                flags: 64,
              }),
            }
          );
        } catch (webhookErr) {
          console.error("Failed to send error webhook:", webhookErr);
        }
      }
    })();

    // Response already sent above
    return;
  }

  return res.status(400).json({ error: "Unknown interaction type" });
}
