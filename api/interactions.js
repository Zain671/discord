export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;
    const type = body?.type;

    console.log("Interaction received, type:", type);

    // Discord PING verification (required for endpoint setup)
    if (type === 1) {
      console.log("PING received, responding with PONG");
      return res.status(200).json({ type: 1 });
    }

    // Button interaction (type 3)
    if (type === 3) {
      const customId = body.data?.custom_id || "";
      const [action, userId] = customId.split("_");
      const message = body.message;
      const token = body.token;
      const member = body.member;
      const appId = body.application_id;

      console.log("Button clicked:", action, "for user:", userId);

      // Respond immediately to Discord (prevents timeout)
      res.status(200).json({ type: 5 });

      // Process button click in background
      processButton(action, userId, appId, token, message, member).catch(err => {
        console.error("Background processing error:", err);
      });

      return;
    }

    // Unknown interaction type
    return res.status(400).json({ error: "Unknown interaction type" });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Background processing function
async function processButton(action, userId, appId, token, message, member) {
  const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
  const robloxApiKey = process.env.ROBLOX_API_KEY;
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  try {
    if (action === "accept") {
      let sheetSuccess = false;
      let robloxSuccess = false;

      // 1. Remove from Google Spreadsheet
      try {
        console.log("Unbanning from spreadsheet:", userId);
        const sheetResponse = await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "unban", 
            userId: userId 
          }),
        });
        
        const sheetData = await sheetResponse.json();
        sheetSuccess = sheetData.success === true;
        console.log("Spreadsheet unban result:", sheetSuccess);
      } catch (sheetErr) {
        console.error("Spreadsheet error:", sheetErr);
      }

      // 2. Unban from Roblox (if API key configured)
      if (robloxApiKey && universeId) {
        try {
          console.log("Unbanning from Roblox:", userId);
          const robloxResponse = await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            { 
              method: "DELETE", 
              headers: { "x-api-key": robloxApiKey } 
            }
          );
          
          robloxSuccess = robloxResponse.ok;
          console.log("Roblox unban result:", robloxSuccess, robloxResponse.status);
        } catch (robloxErr) {
          console.error("Roblox error:", robloxErr);
        }
      }

      // 3. Update Discord message
      const newEmbed = {
        ...message.embeds[0],
        title: "✅ Appeal Accepted",
        color: 3066993, // Green
        fields: [
          ...message.embeds[0].fields,
          { 
            name: "Status", 
            value: `Accepted by <@${member.user.id}>\n${sheetSuccess ? "✅" : "❌"} Spreadsheet\n${robloxSuccess ? "✅" : "⚠️"} Roblox`
          }
        ]
      };

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            embeds: [newEmbed], 
            components: [] // Remove buttons
          }),
        }
      );

      console.log("✅ Appeal accepted for user:", userId);

    } else if (action === "decline") {
      // Update Discord message only (don't unban)
      const newEmbed = {
        ...message.embeds[0],
        title: "❌ Appeal Declined",
        color: 15158332, // Red
        fields: [
          ...message.embeds[0].fields,
          { 
            name: "Status", 
            value: `Declined by <@${member.user.id}>\n❌ User remains banned`
          }
        ]
      };

      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            embeds: [newEmbed], 
            components: [] // Remove buttons
          }),
        }
      );

      console.log("❌ Appeal declined for user:", userId);
    }

  } catch (err) {
    console.error("Fatal error in processButton:", err);
    
    // Try to send error notification to Discord
    try {
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `⚠️ Error processing appeal for user ${userId}: ${err.message}`,
            flags: 64 // Ephemeral
          }),
        }
      );
    } catch (webhookErr) {
      console.error("Failed to send error webhook:", webhookErr);
    }
  }
}
