// api/interactions.js
import nacl from "tweetnacl";
import clientPromise from "../lib/mongodb.js";
import fetch from "node-fetch";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey)
    return res.status(401).json({ error: "Missing headers" });

  try {
    const body = JSON.stringify(req.body);
    const isValid = nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );

    if (!isValid) return res.status(401).json({ error: "Invalid signature" });
  } catch (err) {
    console.error("Signature check failed:", err);
    return res.status(401).json({ error: "Signature verification failed" });
  }

  try {
    const { type, data, message, token, member, application_id } = req.body;
    if (type === 1) return res.status(200).json({ type: 1 });

    if (type === 3) {
      const [action, userId] = (data?.custom_id || "").split("_");
      console.log(`🔵 Button: ${action} for user ${userId}`);
      res.status(200).json({ type: 6 }); // acknowledge
      await processButton(action, userId, application_id, token, message, member);
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
  const dbName = process.env.MONGODB_DB_NAME || "roblox_bans";

  if (action === "accept") {
    console.log(`✅ Accepting appeal for ${userId}`);

    const result = { mongo: null, roblox: null };

    // 🟢 MongoDB Unban
    try {
      const client = await clientPromise;
      const db = client.db(dbName);
      const bans = db.collection("bans");

      const update = await bans.updateOne(
        { userId: String(userId) },
        { $set: { active: false, unbannedAt: new Date() } }
      );

      if (update.matchedCount > 0) {
        console.log(`✅ MongoDB: ${userId} unbanned`);
        result.mongo = true;
      } else {
        console.warn(`⚠️ MongoDB: ${userId} not found`);
        result.mongo = "User not found";
      }
    } catch (err) {
      console.error("❌ MongoDB error:", err.message);
      result.mongo = err.message;
    }

    // 🟢 Roblox API Unban
    try {
      if (!robloxKey || !universeId) throw new Error("Missing Roblox credentials");

      const robloxRes = await Promise.race([
        fetch(`https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`, {
          method: "DELETE",
          headers: { "x-api-key": robloxKey },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Roblox timeout")), 7000)),
      ]);

      if (robloxRes.status === 204 || robloxRes.status === 200 || robloxRes.status === 404) {
        console.log(`✅ Roblox: ${userId} unbanned or not found`);
        result.roblox = true;
      } else {
        const text = await robloxRes.text();
        console.error(`❌ Roblox API error: ${text}`);
        result.roblox = `Roblox API ${robloxRes.status}`;
      }
    } catch (err) {
      console.error("❌ Roblox fetch error:", err.message);
      result.roblox = err.message;
    }

    // 🟢 Discord Update
    const embed = buildEmbed(message, member, result);
    await updateDiscordMessage(appId, token, message.id, embed);
  }
}

function buildEmbed(message, member, result) {
  const base = message.embeds?.[0] || {};
  const accepted = result.mongo === true && result.roblox === true;

  return {
    ...base,
    title: accepted ? "✅ Appeal Accepted" : "⚠️ Partial / Failed",
    color: accepted ? 0x2ecc71 : 0xe67e22,
    fields: [
      ...(base.fields || []),
      { name: "Status", value: `Processed by <@${member.user.id}>` },
      { name: "MongoDB", value: result.mongo === true ? "✅ Unbanned" : `❌ ${result.mongo}` },
      { name: "Roblox", value: result.roblox === true ? "✅ Unbanned" : `❌ ${result.roblox}` },
    ],
  };
}

async function updateDiscordMessage(appId, token, messageId, embed) {
  try {
    const response = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], components: [] }),
    });
    if (!response.ok) console.error(`❌ Discord update failed: ${response.status}`);
    else console.log(`✅ Discord message updated`);
  } catch (err) {
    console.error("❌ Discord update error:", err.message);
  }
}
