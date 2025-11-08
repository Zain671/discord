import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

const options = {
  maxPoolSize: 10,
  minPoolSize: 1,
  connectTimeoutMS: 20000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: "majority"
};

if (!process.env.MONGODB_URI) {
  throw new Error("❌ Missing MONGODB_URI in environment variables");
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
