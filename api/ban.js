// api/ban.js
// Ban a player and log to MongoDB + send to Discord

import clientPromise from '../lib/mongodb.js';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, username, moderator, reason, duration } = req.body;

    // Validate input
    if (!userId || !username || !moderator || !reason) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, username, moderator, reason' 
      });
    }

    console.log(`📝 Banning user ${username} (${userId}) by ${moderator}`);

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'roblox_bans');
    const bansCollection = db.collection('bans');

    // Create ban document
    const bannedAt = new Date();
    const expiresAt = duration ? new Date(bannedAt.getTime() + duration * 1000) : null;

// Remove createdAt from banDocument
const banDocument = {
  userId: String(userId),
  username,
  moderator,
  reason,
  duration: duration || null,
  durationText: formatDuration(duration),
  bannedAt,
  expiresAt,
  active: true,
  updatedAt: bannedAt // keep updatedAt, remove createdAt
};

await bansCollection.updateOne(
  { userId: String(userId) },
  { 
    $set: banDocument,
    $setOnInsert: { createdAt: bannedAt } // only sets createdAt if new
  },
  { upsert: true }
);

    console.log(`✅ Ban saved to MongoDB for user ${userId}`);

    // Send to Discord
    const discordBotToken = process.env.DISCORD_BOT_TOKEN;
    const discordChannelId = process.env.DISCORD_CHANNEL_ID;

    if (discordBotToken && discordChannelId) {
      try {
        await sendToDiscord(discordBotToken, discordChannelId, {
          username,
          userId,
          moderator,
          reason,
          duration: formatDuration(duration)
        });
        console.log(`✅ Sent ban notification to Discord`);
      } catch (discordError) {
        console.error('⚠️ Failed to send to Discord:', discordError.message);
        // Don't fail the request if Discord fails
      }
    }

    return res.status(200).json({ 
      success: true,
      message: 'Player banned successfully',
      ban: {
        userId,
        username,
        bannedAt,
        expiresAt,
        duration: formatDuration(duration)
      }
    });

  } catch (error) {
    console.error('❌ Ban error:', error);
    return res.status(500).json({ 
      error: 'Failed to ban player',
      details: error.message 
    });
  }
}

function formatDuration(seconds) {
  if (!seconds) return 'Permanent';
  
  const units = [
    [31536000, 'year'], [2592000, 'month'], [604800, 'week'],
    [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']
  ];
  
  for (const [value, unit] of units) {
    const count = Math.floor(seconds / value);
    if (count > 0) {
      return `${count} ${unit}${count > 1 ? 's' : ''}`;
    }
  }
  
  return 'Permanent';
}

async function sendToDiscord(botToken, channelId, data) {
  const embed = {
    title: '🔨 Player Banned',
    color: 16776960, // Yellow
    fields: [
      { name: 'Player', value: `${data.username} (ID: ${data.userId})` },
      { name: 'Moderator', value: data.moderator },
      { name: 'Reason', value: data.reason },
      { name: 'Duration', value: data.duration }
    ],
    footer: { text: 'Ban System' },
    timestamp: new Date().toISOString()
  };

  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${botToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ embeds: [embed] })
  });
}
