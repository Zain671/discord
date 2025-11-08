
// api/interactions.js
// Discord interaction handler with MongoDB + Roblox Cloud API

import nacl from "tweetnacl";
import clientPromise from '../lib/mongodb.js';
import fetch from 'node-fetch';

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

      // Respond immediately
      res.status(200).json({ type: 6 });

      // Process in background
      processButton(action, userId, application_id, token, message, member);
      
      return;
    }

    return res.status(400).json({ error: "Unknown type" });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function processButton(action, userId, appId, token, message, member) {
  const robloxKey = process.env.ROBLOX_API_KEY;
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  if (action === "accept") {
    console.log(`✅ Processing accept for ${userId}`);
    
    const results = {
      mongodb: false,
      roblox: false,
      mongodbError: null,
      robloxError: null
    };

    // Step 1: Unban from MongoDB (FAST!)
    try {
      const client = await clientPromise;
      const db = client.db(process.env.MONGODB_DB_NAME || 'roblox_bans');
      const bansCollection = db.collection('bans');

      const result = await bansCollection.updateOne(
        { userId: String(userId) },
        { 
          $set: { 
            active: false,
            unbannedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount > 0) {
        results.mongodb = true;
        console.log(`✅ MongoDB: User ${userId} unbanned`);
      } else {
        results.mongodbError = "User not found in database";
        console.log(`⚠️ MongoDB: User ${userId} not found`);
      }
    } catch (mongoError) {
      results.mongodbError = mongoError.message;
      console.error(`❌ MongoDB error:`, mongoError);
    }

    // Step 2: Unban from Roblox
    if (robloxKey && universeId) {
      try {
        const robloxResponse = await Promise.race([
          fetch(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
            {
              method: "DELETE",
              headers: { "x-api-key": robloxKey }
            }
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Roblox timeout")), 8000)
          )
        ]);

        console.log(`🎮 Roblox status: ${robloxResponse.status}`);

        if (robloxResponse.status === 200 || robloxResponse.status === 204) {
          results.roblox = true;
          console.log(`✅ Roblox: User ${userId} unbanned`);
        } else if (robloxResponse.status === 404) {
          results.roblox = true;
          console.log(`✅ Roblox: User ${userId} wasn't banned (404)`);
        } else {
          const text = await robloxResponse.text();
          results.robloxError = `Status ${robloxResponse.status}`;
          console.error(`❌ Roblox error:`, text);
        }
      } catch (robloxErr) {
        results.robloxError = robloxErr.message;
        console.error(`❌ Roblox error:`, robloxErr);
      }
    } else {
      results.robloxError = "Missing Roblox credentials";
    }

    // Step 3: Update Discord
    let embed;
    
    if (results.mongodb && results.roblox) {
      // Full success
      embed = {
        ...message.embeds[0],
        title: "✅ Appeal Accepted",
        color: 3066993,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Accepted by <@${member.user.id}>` },
          { name: "Database", value: "✅ Unbanned" },
          { name: "Roblox", value: "✅ Unbanned" }
        ]
      };
    } else if (results.mongodb && !results.roblox) {
      // MongoDB worked, Roblox failed
      embed = {
        ...message.embeds[0],
        title: "⚠️ Partially Accepted",
        color: 16776960,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Accepted by <@${member.user.id}>` },
          { name: "Database", value: "✅ Unbanned" },
          { name: "Roblox", value: `❌ ${results.robloxError}\nPlease unban manually.` }
        ]
      };
    } else if (!results.mongodb && results.roblox) {
      // Roblox worked, MongoDB failed
      embed = {
        ...message.embeds[0],
        title: "⚠️ Partially Accepted",
        color: 16776960,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Accepted by <@${member.user.id}>` },
          { name: "Database", value: `❌ ${results.mongodbError}` },
          { name: "Roblox", value: "✅ Unbanned" }
        ]
      };
    } else {
      // Both failed
      embed = {
        ...message.embeds[0],
        title: "❌ Error Processing Appeal",
        color: 15158332,
        fields: [
          ...message.embeds[0].fields,
          { name: "Status", value: `Attempted by <@${member.user.id}>` },
          { name: "Database", value: `❌ ${results.mongodbError}` },
          { name: "Roblox", value: `❌ ${results.robloxError}` }
        ]
      };
    }

    await updateDiscordMessage(appId, token, message.id, embed);
    console.log(`✅ Discord updated for ${userId}`);

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

    await updateDiscordMessage(appId, token, message.id, embed);
  }
}

async function updateDiscordMessage(appId, token, messageId, embed) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed], components: [] })
      }
    );
    
    if (!response.ok) {
      console.error(`❌ Discord update failed: ${response.status}`);
    }
  } catch (err) {
    console.error(`❌ Discord error:`, err);
  }
}
