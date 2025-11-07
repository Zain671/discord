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

      console.log(`🔵 [START] Button clicked: ${action} for user ${userId}`);

      // Respond immediately to prevent timeout
      res.status(200).json({ type: 6 });

      // Process in background with detailed logging
      setImmediate(() => {
        handleButton(action, userId, application_id, token, message, member).catch(err => {
          console.error(`❌ [FATAL] Unhandled error in handleButton:`, err);
        });
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

  console.log(`🔵 [HANDLER] Starting ${action} for user ${userId}`);
  console.log(`🔵 [CONFIG] Sheet URL: ${sheetUrl}`);
  console.log(`🔵 [CONFIG] Roblox API Key: ${robloxKey ? "✅ Set" : "❌ Missing"}`);
  console.log(`🔵 [CONFIG] Universe ID: ${universeId ? "✅ Set (" + universeId + ")" : "❌ Missing"}`);

  try {
    if (action === "accept") {
      // ===== STEP 1: UNBAN FROM SHEET =====
      console.log(`📊 [SHEET-START] Removing user ${userId} from spreadsheet...`);
      console.log(`📊 [SHEET-REQUEST] URL: ${sheetUrl}`);
      console.log(`📊 [SHEET-REQUEST] Body:`, JSON.stringify({ action: "unban", userId: String(userId) }));
      
      let sheetResponse;
      try {
        const fetchStartTime = Date.now();
        sheetResponse = await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "unban", 
            userId: String(userId)
          }),
        });
        const fetchDuration = Date.now() - fetchStartTime;
        
        console.log(`📊 [SHEET-RESPONSE] Status: ${sheetResponse.status} ${sheetResponse.statusText}`);
        console.log(`📊 [SHEET-RESPONSE] OK: ${sheetResponse.ok}`);
        console.log(`📊 [SHEET-RESPONSE] Duration: ${fetchDuration}ms`);
        console.log(`📊 [SHEET-RESPONSE] Content-Type: ${sheetResponse.headers.get("content-type")}`);

        const responseText = await sheetResponse.text();
        console.log(`📊 [SHEET-RESPONSE] Body length: ${responseText.length} bytes`);
        console.log(`📊 [SHEET-RESPONSE] Body (first 500 chars): ${responseText.substring(0, 500)}`);

        let sheetData;
        try {
          sheetData = JSON.parse(responseText);
          console.log(`📊 [SHEET-RESPONSE] Parsed JSON:`, JSON.stringify(sheetData, null, 2));
        } catch (parseError) {
          console.error(`❌ [SHEET-ERROR] Failed to parse JSON:`, parseError.message);
          console.error(`❌ [SHEET-ERROR] Response was not JSON! Got:`, responseText.substring(0, 200));
          
          // Check if it's HTML
          if (responseText.includes("<!DOCTYPE") || responseText.includes("<html")) {
            console.error(`❌ [SHEET-ERROR] Got HTML instead of JSON - Google Apps Script error!`);
          }
          
          throw new Error("Sheet returned non-JSON response");
        }

        if (!sheetResponse.ok) {
          console.error(`❌ [SHEET-ERROR] HTTP error: ${sheetResponse.status}`);
          throw new Error(`Sheet HTTP error: ${sheetResponse.status}`);
        }

        if (!sheetData.success) {
          console.error(`❌ [SHEET-ERROR] Sheet returned success=false:`, sheetData);
          throw new Error(sheetData.message || "Sheet unban failed");
        }

        console.log(`✅ [SHEET-SUCCESS] User ${userId} removed from spreadsheet`);

      } catch (sheetError) {
        console.error(`❌ [SHEET-FATAL] Exception:`, sheetError.message);
        console.error(`❌ [SHEET-FATAL] Stack:`, sheetError.stack);
        
        // Update Discord with sheet error
        const embed = {
          ...message.embeds[0],
          title: "⚠️ Error Removing from Spreadsheet",
          color: 16776960,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Attempted by <@${member.user.id}>` },
            { name: "Error", value: `\`\`\`${sheetError.message}\`\`\`` }
          ]
        };

        await updateDiscordMessage(appId, token, message.id, embed);
        return; // Stop here if sheet fails
      }

      // ===== STEP 2: UNBAN FROM ROBLOX =====
      let robloxSuccess = false;
      let robloxError = null;

      if (robloxKey && universeId) {
        console.log(`🎮 [ROBLOX-START] Unbanning user ${userId} from Roblox...`);
        console.log(`🎮 [ROBLOX-REQUEST] URL: https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`);
        console.log(`🎮 [ROBLOX-REQUEST] Method: DELETE`);
        console.log(`🎮 [ROBLOX-REQUEST] API Key: ${robloxKey.substring(0, 20)}...`);
        
        try {
          const fetchStartTime = Date.now();
          const robloxResponse = await fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            { 
              method: "DELETE",
              headers: { 
                "x-api-key": robloxKey
              }
            }
          );
          const fetchDuration = Date.now() - fetchStartTime;

          console.log(`🎮 [ROBLOX-RESPONSE] Status: ${robloxResponse.status} ${robloxResponse.statusText}`);
          console.log(`🎮 [ROBLOX-RESPONSE] OK: ${robloxResponse.ok}`);
          console.log(`🎮 [ROBLOX-RESPONSE] Duration: ${fetchDuration}ms`);

          const responseText = await robloxResponse.text();
          console.log(`🎮 [ROBLOX-RESPONSE] Body: ${responseText || "(empty)"}`);

          if (robloxResponse.status === 200 || robloxResponse.status === 204) {
            console.log(`✅ [ROBLOX-SUCCESS] User ${userId} unbanned!`);
            robloxSuccess = true;
          } else if (robloxResponse.status === 404) {
            console.log(`⚠️  [ROBLOX-WARNING] User ${userId} not found (404 - already unbanned?)`);
            robloxSuccess = true; // Count as success
          } else {
            console.error(`❌ [ROBLOX-ERROR] HTTP ${robloxResponse.status}:`, responseText);
            robloxError = `Status ${robloxResponse.status}: ${responseText}`;
          }
        } catch (robloxErr) {
          console.error(`❌ [ROBLOX-FATAL] Exception:`, robloxErr.message);
          console.error(`❌ [ROBLOX-FATAL] Stack:`, robloxErr.stack);
          robloxError = robloxErr.message;
        }
      } else {
        console.warn(`⚠️  [ROBLOX-SKIP] Missing credentials - skipping Roblox unban`);
        robloxError = "Missing Roblox credentials";
      }

      // ===== STEP 3: UPDATE DISCORD =====
      console.log(`💬 [DISCORD-START] Updating message...`);
      
      let embed;
      if (robloxSuccess) {
        embed = {
          ...message.embeds[0],
          title: "✅ Appeal Accepted",
          color: 3066993,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: "✅ Removed" },
            { name: "Roblox", value: "✅ Unbanned" }
          ]
        };
      } else {
        embed = {
          ...message.embeds[0],
          title: "⚠️ Partial Success",
          color: 16776960,
          fields: [
            ...message.embeds[0].fields,
            { name: "Status", value: `Accepted by <@${member.user.id}>` },
            { name: "Spreadsheet", value: "✅ Removed" },
            { name: "Roblox", value: `❌ Failed\n\`\`\`${robloxError}\`\`\`` }
          ]
        };
      }

      await updateDiscordMessage(appId, token, message.id, embed);
      console.log(`✅ [DISCORD-SUCCESS] Message updated`);
      console.log(`🔵 [END] Finished processing ${action} for user ${userId}`);

    } else if (action === "decline") {
      console.log(`❌ [DECLINE] Declining appeal for user ${userId}`);
      
      const embed = {
        ...message.embeds[0],
        title: "❌ Appeal Declined",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Declined by <@${member.user.id}>` }
        ]
      };

      await updateDiscordMessage(appId, token, message.id, embed);
      console.log(`✅ [DECLINE-SUCCESS] Appeal declined for user ${userId}`);
    }
  } catch (err) {
    console.error(`❌ [HANDLER-FATAL] Unhandled error:`, err.message);
    console.error(`❌ [HANDLER-FATAL] Stack:`, err.stack);
    
    try {
      const embed = {
        ...message.embeds[0],
        title: "❌ Error Processing Appeal",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Error", value: `\`\`\`${err.message}\`\`\`` }
        ]
      };

      await updateDiscordMessage(appId, token, message.id, embed);
    } catch (updateError) {
      console.error(`❌ [DISCORD-FATAL] Failed to update message:`, updateError.message);
    }
  }
}

async function updateDiscordMessage(appId, token, messageId, embed) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${messageId}`;
  console.log(`💬 [DISCORD-UPDATE] URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], components: [] }),
    });
    
    console.log(`💬 [DISCORD-UPDATE] Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [DISCORD-ERROR] Failed to update:`, errorText);
    }
  } catch (err) {
    console.error(`❌ [DISCORD-ERROR] Exception:`, err.message);
    throw err;
  }
}
