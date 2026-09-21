import { createClient } from "redis";
import "dotenv/config";

const redisPassword = process.env.REDIS_PASSWORD;
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT; 

// Initialize the Redis client
const redisClient = createClient({
  url: `redis://:${redisPassword}@${redisHost}:${redisPort}`
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('🔄 Connected to Redis successfully!'));

// Connect to Redis asynchronously
(async () => {
  await redisClient.connect();
})();

export default redisClient;