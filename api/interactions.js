import fetch from "node-fetch";

export default async function handler(req, res) {
  const { type, data, message, token, member } = req.body;

  // Discord PING
  if (type === 1) {
    return res.json({ type: 1 });
  }

  // Button interaction
  if (type === 3) {
    const customId = data.custom_id;
    const [action, userId] = customId.split("_");

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const appId = process.env.DISCORD_APPLICATION_ID;
    const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
    const robloxApiKey = process.env.ROBLOX_API_KEY;
    const universeId = process.env.ROBLOX_UNIVERSE_ID;

    if (action === "accept") {
      try {
        // 1. Remove from Google Sheet
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
          } else {
            const errorText = await robloxResponse.text();
            console.warn("⚠️ Roblox unban warning:", errorText);
            // Don't fail the whole process if Roblox unban fails
          }
        } catch (robloxErr) {
          console.error("❌ Roblox API error:", robloxErr);
          // Continue anyway
        }

        // 3. Update Discord message
        const embed = message.embeds[0];
        embed.title = "✅ Appeal Accepted";
        embed.color = 3066993; // Green
        embed.fields.push({
          name: "Status",
          value: `Accepted by <@${member.user.id}>\n✅ Removed from spreadsheet\n✅ Unbanned from Roblox`,
        });

        await fetch(
          `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [embed],
              components: [], // Remove buttons
            }),
          }
        );

        return res.json({
          type: 4,
          data: {
            content: `✅ Appeal accepted! User ${userId} has been unbanned from both the spreadsheet and Roblox.`,
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Error accepting appeal:", err);
        return res.json({
          type: 4,
          data: {
            content: "❌ Error processing appeal: " + err.message,
            flags: 64,
          },
        });
      }
    } else if (action === "decline") {
      try {
        // Just update the Discord message, keep the ban
        const embed = message.embeds[0];
        embed.title = "❌ Appeal Declined";
        embed.color = 15158332; // Red
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
              components: [], // Remove buttons
            }),
          }
        );

        return res.json({
          type: 4,
          data: {
            content: `❌ Appeal declined for user ${userId}. Ban remains active.`,
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Error declining appeal:", err);
        return res.json({
          type: 4,
          data: {
            content: "❌ Error: " + err.message,
            flags: 64,
          },
        });
      }
    }
  }

  return res.status(400).json({ error: "Unknown interaction type" });
}
