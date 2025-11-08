import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) throw new Error("❌ Missing MONGODB_URI in environment variables");

let client;
let clientPromise;

const options = {
  maxPoolSize: 10,
  minPoolSize: 1,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 30000,
  retryWrites: true,
  w: "majority",
};

// ✅ Handle re-use for Vercel's hot reloading
if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // ✅ For serverless (production)
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
