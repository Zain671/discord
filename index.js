export default function handler(req, res) {
  res.status(200).json({ 
    status: "online",
    message: "Discord Ban System API",
    endpoints: {
      appeal: "/api/appeal",
      interactions: "/api/interactions"
    }
  });
}
