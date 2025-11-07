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

      console.log(`🔵 Button: ${action} for user ${userId}`);

      // Respond immediately - NO waiting for anything
      res.status(200).json({ type: 6 });

      // Process everything asynchronously WITHOUT awaiting
      // This prevents Vercel timeouts
      processButton(action, userId, application_id, token, message, member);
      
      return;
    }

    return res.status(400).json({ error: "Unknown type" });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Fire-and-forget: This runs AFTER the response is sent
// Even if it takes 30 seconds, Vercel won't timeout
function processButton(action, userId, appId, token, message, member) {
  const sheetUrl = "https://script.google.com/macros/s/AKfycbzyDf8MqRuaTEwp_MteP84ofckSX7X1zFbBP2qKwVHCuSzz1tP2TcFB5fosEklauzUg/exec";
  const robloxKey = process.env.ROBLOX_API_KEY;
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  if (action === "accept") {
    console.log(`✅ Processing accept for ${userId}`);
    
    // Track what succeeds/fails
    const results = {
      sheet: false,
      roblox: false,
      sheetError: null,
      robloxError: null
    };

    // Step 1: Unban from sheet (with timeout)
    const sheetPromise = Promise.race([
      fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "unban", 
          userId: String(userId)
        })
      }).then(async (res) => {
        console.log(`📊 Sheet status: ${res.status}`);
        const text = await res.text();
        console.log(`📊 Sheet response: ${text.substring(0, 200)}`);
        
        try {
          const data = JSON.parse(text);
          if (data.success) {
            results.sheet = true;
            console.log(`✅ Sheet: User ${userId} removed`);
          } else {
            results.sheetError = data.message || "Unknown error";
            console.log(`❌ Sheet failed: ${results.sheetError}`);
          }
        } catch (e) {
          results.sheetError = "Invalid JSON response";
          console.log(`❌ Sheet returned non-JSON: ${text.substring(0, 100)}`);
        }
      }),
      // 8 second timeout for sheet
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Sheet timeout")), 8000)
      )
    ]).catch((err) => {
      results.sheetError = err.message;
      console.log(`❌ Sheet error: ${err.message}`);
    });

    // Step 2: Unban from Roblox (with timeout)
    const robloxPromise = (robloxKey && universeId) ? Promise.race([
      fetch(
        `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
        {
          method: "DELETE",
          headers: { "x-api-key": robloxKey }
        }
      ).then(async (res) => {
        console.log(`🎮 Roblox status: ${res.status}`);
        
        if (res.status === 200 || res.status === 204) {
          results.roblox = true;
          console.log(`✅ Roblox: User ${userId} unbanned`);
        } else if (res.status === 404) {
          results.roblox = true; // Not banned = success
          console.log(`✅ Roblox: User ${userId} wasn't banned (404)`);
        } else {
          const text = await res.text();
          results.robloxError = `Status ${res.status}: ${text}`;
          console.log(`❌ Roblox failed: ${results.robloxError}`);
        }
      }),
      // 8 second timeout for Roblox
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Roblox timeout")), 8000)
      )
    ]).catch((err) => {
      results.robloxError = err.message;
      console.log(`❌ Roblox error: ${err.message}`);
    }) : Promise.resolve();

    // Step 3: Wait for both, then update Discord
    Promise.all([sheetPromise, robloxPromise]).finally(() => {
      console.log(`📊 Final results:`, results);
      
      // Build embed based on results
      let embed;
      let title;
      let color;
      
      if (results.sheet && results.roblox) {
        // Full success
        title = "✅ Appeal Accepted";
        color = 3066993; // Green
        embed = {
          ...message.embeds[0],
          title,
          color,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: "✅ Removed" },
            { name: "Roblox", value: "✅ Unbanned" }
          ]
        };
      } else if (results.sheet && !results.roblox) {
        // Sheet worked, Roblox failed
        title = "⚠️ Partially Accepted";
        color = 16776960; // Yellow
        embed = {
          ...message.embeds[0],
          title,
          color,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: "✅ Removed" },
            { name: "Roblox", value: `❌ ${results.robloxError || "Failed"}\nPlease unban manually in-game.` }
          ]
        };
      } else if (!results.sheet && results.roblox) {
        // Roblox worked, sheet failed
        title = "⚠️ Partially Accepted";
        color = 16776960; // Yellow
        embed = {
          ...message.embeds[0],
          title,
          color,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: `❌ ${results.sheetError || "Failed"}\nPlease remove manually.` },
            { name: "Roblox", value: "✅ Unbanned" }
          ]
        };
      } else {
        // Both failed
        title = "❌ Error Processing Appeal";
        color = 15158332; // Red
        embed = {
          ...message.embeds[0],
          title,
          color,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Attempted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: `❌ ${results.sheetError || "Failed"}` },
            { name: "Roblox", value: `❌ ${results.robloxError || "Failed"}` }
          ]
        };
      }

      // Update Discord message
      fetch(
        `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed], components: [] })
        }
      ).then(res => {
        if (res.ok) {
          console.log(`✅ Discord updated for ${userId}`);
        } else {
          console.log(`❌ Failed to update Discord: ${res.status}`);
        }
      }).catch(err => {
        console.log(`❌ Discord update error: ${err.message}`);
      });
    });

  } else if (action === "decline") {
    console.log(`❌ Declining appeal for ${userId}`);
    
    const embed = {
      ...message.embeds[0],
      title: "❌ Appeal Declined",
      color: 15158332,
      fields: [
        ...message.embeds[0].fields,
        { name: "Status", value: `Declined by <@${member.user.id}>` }
      ]
    };

    fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${message.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed], components: [] })
      }
    ).then(res => {
      console.log(`✅ Appeal declined for ${userId}`);
    }).catch(err => {
      console.log(`❌ Error declining: ${err.message}`);
    });
  }
}
