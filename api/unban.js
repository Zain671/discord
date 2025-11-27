import clientPromise from '../lib/mongodb.js';

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
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    console.log(`🔓 Unbanning user ${userId}`);

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'roblox_bans');
    const bansCollection = db.collection('bans');

    // Mark ban as inactive (soft delete - keeps history)
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

    if (result.matchedCount === 0) {
      console.log(`⚠️ User ${userId} not found in bans`);
      return res.status(404).json({ 
        success: false,
        message: 'User not found in ban list' 
      });
    }

    console.log(`✅ User ${userId} unbanned successfully`);

    return res.status(200).json({ 
      success: true,
      message: 'Player unbanned successfully',
      userId 
    });

  } catch (error) {
    console.error('❌ Unban error:', error);
    return res.status(500).json({ 
      error: 'Failed to unban player',
      details: error.message 
    });
  }
}
