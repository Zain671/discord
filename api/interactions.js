import nacl from "tweetnacl";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify Discord signature
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
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
      return res.status(401).json({ error: "Invalid signature" });
    }
  } catch (err) {
    console.error("Signature error:", err);
    return res.status(401).json({ error: "Verification failed" });
  }

  // Process interaction
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

      console.log(`Button clicked: ${action} for user ${userId}`);

      // Respond immediately
      res.status(200).json({ type: 5 });

      // Process in background - don't await, let it run independently
      setImmediate(() => {
        handleButton(action, userId, application_id, token, message, member)
          .catch(err => console.error("Background error:", err));
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
  console.log(`Processing ${action} for user ${userId}`);
  
  const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
  const robloxKey = process.env.ROBLOX_API_KEY;
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  try {
    if (action === "accept") {
      console.log("Starting accept process...");
      
      // Unban from sheet
      try {
        console.log("Calling sheet API...");
        const sheetResponse = await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unban", userId }),
        });
        const sheetResult = await sheetResponse.json();
        console.log("Sheet response:", sheetResult);
      } catch (sheetErr) {
        console.error("Sheet error:", sheetErr);
      }

      // Unban from Roblox
      if (robloxKey && universeId) {
        try {
          console.log("Calling Roblox API...");
          const robloxResponse = await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            { method: "DELETE", headers: { "x-api-key": robloxKey } }
          );
          console.log("Roblox response:", robloxResponse.status);
        } catch (robloxErr) {
          console.error("Roblox error:", robloxErr);
        }
      }

      // Update Discord message
      console.log("Updating Discord message...");
      const newEmbed = {
        title: "✅ Appeal Accepted",
        description: message.embeds[0].description || "",
        color: 3066993,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `✅ Accepted by <@${member.user.id}>` }
        ],
        footer: message.embeds[0].footer,
        timestamp: message.embeds[0].timestamp
      };

      const updateResponse = await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            embeds: [newEmbed], 
            components: [] 
          }),
        }
      );

      console.log("Discord update status:", updateResponse.status);

      // Send follow-up message
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `✅ User ${userId} has been unbanned successfully!`,
          }),
        }
      );

      console.log("Accept process complete!");

    } else if (action === "decline") {
      console.log("Starting decline process...");

      const newEmbed = {
        title: "❌ Appeal Declined",
        description: message.embeds[0].description || "",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `❌ Declined by <@${member.user.id}>` }
        ],
        footer: message.embeds[0].footer,
        timestamp: message.embeds[0].timestamp
      };

      const updateResponse = await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            embeds: [newEmbed], 
            components: [] 
          }),
        }
      );

      console.log("Discord update status:", updateResponse.status);

      // Send follow-up message
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `❌ Appeal declined for user ${userId}.`,
          }),
        }
      );

      console.log("Decline process complete!");
    }

  } catch (err) {
    console.error("Fatal error in handleButton:", err);
    
    // Send error message to Discord
    try {
      await fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `⚠️ Error processing appeal: ${err.message}`,
          }),
        }
      );
    } catch (webhookErr) {
      console.error("Failed to send error webhook:", webhookErr);
    }
  }
}
