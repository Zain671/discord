// api/index.js
export default function handler(req, res) {
  return res.status(200).json({
    service: "Roblox Ban System",
    version: "2.0.0",
    status: "✅ Online",
    timestamp: new Date().toISOString(),
    endpoints: {
      ban: "/api/ban",
      unban: "/api/unban",
      check: "/api/check-ban",
      appeal: "/api/appeal",
      interactions: "/api/interactions"
    }
  });
}
