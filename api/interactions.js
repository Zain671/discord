import fetch from "node-fetch";
import crypto from "crypto";

// Verify Discord signature
function verifyDiscordRequest(req) {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const body = JSON.stringify(req.body);

  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
  
  if (!signature || !timestamp || !PUBLIC_KEY) {
    return false;
  }

  try {
    const isValid = crypto.verify(
      "sha512",
      Buffer.from(timestamp + body),
      {
        key: Buffer.from(PUBLIC_KEY, "hex"),
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      },
      Buffer.from(signature, "hex")
    );
    return isValid;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // Verify the request is from Discord
  if (!verifyDiscordRequest(req)) {
    return res.status(401).json({ error: "Invalid request signature" });
  }

  const { type, data, message } = req.body;

  // Discord sends a PING to verify the endpoint
  if (type === 1) {
    return res.json({ type: 1 });
  }

  // Handle button interactions
  if (type === 3) {
    const customId = data.custom_id;
    const [action, userId] = customId.split("_");

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const sheetUrl = process.env.GOOGLE_SHEET_URL;

    if (action === "accept") {
      // Remove from Google Sheet
      try {
        await fetch(sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unban",
            userId: userId,
          }),
        });

        // Update Discord message
        await fetch(
          `https://discord.com/api/v10/webhooks/${process.env.DISCORD_APPLICATION_ID}/${req.body.token}/messages/${message.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              embeds: [
                {
                  ...message.embeds[0],
                  title: "✅ Appeal Accepted",
                  color: 3066993, // Green
                  fields: [
                    ...message.embeds[0].fields,
                    {
                      name: "Status",
                      value: `Accepted by <@${req.body.member.user.id}>`,
                    },
                  ],
                },
              ],
              components: [], // Remove buttons
            }),
          }
        );

        return res.json({
          type: 4,
          data: {
            content: `✅ Appeal accepted! User ${userId} has been unbanned.`,
            flags: 64, // Ephemeral (only visible to the person who clicked)
          },
        });
      } catch (err) {
        console.error("Error accepting appeal:", err);
        return res.json({
          type: 4,
          data: {
            content: "❌ Error processing appeal. Check logs.",
            flags: 64,
          },
        });
      }
    } else if (action === "decline") {
      // Just update the message, don't remove from sheet
      try {
        await fetch(
          `https://discord.com/api/v10/webhooks/${process.env.DISCORD_APPLICATION_ID}/${req.body.token}/messages/${message.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              embeds: [
                {
                  ...message.embeds[0],
                  title: "❌ Appeal Declined",
                  color: 15158332, // Red
                  fields: [
                    ...message.embeds[0].fields,
                    {
                      name: "Status",
                      value: `Declined by <@${req.body.member.user.id}>`,
                    },
                  ],
                },
              ],
              components: [], // Remove buttons
            }),
          }
        );

        return res.json({
          type: 4,
          data: {
            content: `❌ Appeal declined for user ${userId}.`,
            flags: 64,
          },
        });
      } catch (err) {
        console.error("Error declining appeal:", err);
        return res.json({
          type: 4,
          data: {
            content: "❌ Error processing appeal. Check logs.",
            flags: 64,
          },
        });
      }
    }
  }

  return res.status(400).json({ error: "Unknown interaction type" });
}
