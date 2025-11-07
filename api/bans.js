// api/bans.js
// Get all active bans (for admin dashboard)

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
    const { active = 'true', limit = '100', skip = '0' } = req.query;

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'roblox_bans');
    const bansCollection = db.collection('bans');

    // Build query
    const query = {};
    if (active === 'true') {
      query.active = true;
    }

    // Get bans with pagination
    const bans = await bansCollection
      .find(query)
      .sort({ bannedAt: -1 }) // Most recent first
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .toArray();

    // Get total count
    const total = await bansCollection.countDocuments(query);

    // Clean up expired bans
    const now = new Date();
    const expiredBans = bans.filter(ban => 
      ban.active && ban.expiresAt && ban.expiresAt < now
    );

    if (expiredBans.length > 0) {
      const expiredIds = expiredBans.map(ban => ban._id);
      await bansCollection.updateMany(
        { _id: { $in: expiredIds } },
        { 
          $set: { 
            active: false,
            updatedAt: now
          }
        }
      );
      console.log(`🔄 Marked ${expiredBans.length} expired bans as inactive`);
    }

    // Remove expired bans from response
    const activeBans = bans.filter(ban => 
      !ban.expiresAt || ban.expiresAt >= now
    );

    return res.status(200).json({
      success: true,
      bans: activeBans.map(ban => ({
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
      })),
      total: activeBans.length,
      totalInDatabase: total,
      page: Math.floor(parseInt(skip) / parseInt(limit)) + 1,
      pages: Math.ceil(total / parseInt(limit))
    });

  } catch (error) {
    console.error('❌ Get bans error:', error);
    return res.status(500).json({ 
      error: 'Failed to get bans',
      details: error.message 
    });
  }
}
