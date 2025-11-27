import clientPromise from '../lib/mongodb.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'roblox_bans');
    const bansCollection = db.collection('bans');

    // Find active ban for this user
    const ban = await bansCollection.findOne({
      userId: String(userId),
      active: true
    });

    if (!ban) {
      return res.status(200).json({ 
        banned: false,
        userId 
      });
    }

    // Check if ban expired
    const now = new Date();
    if (ban.expiresAt && ban.expiresAt < now) {
      // Ban expired, mark as inactive
      await bansCollection.updateOne(
        { _id: ban._id },
        { 
          $set: { 
            active: false,
            updatedAt: now
          }
        }
      );

      return res.status(200).json({ 
        banned: false,
        userId,
        note: 'Ban expired'
      });
    }

    // Ban is active
    return res.status(200).json({
      banned: true,
      userId: ban.userId,
      username: ban.username,
      moderator: ban.moderator,
      reason: ban.reason,
      duration: ban.durationText,
      bannedAt: ban.bannedAt,
      expiresAt: ban.expiresAt,
      daysRemaining: ban.expiresAt 
        ? Math.ceil((ban.expiresAt - now) / (1000 * 60 * 60 * 24))
        : null
    });

  } catch (error) {
    console.error('❌ Check ban error:', error);
    return res.status(500).json({ 
      error: 'Failed to check ban status',
      details: error.message 
    });
  }
}
