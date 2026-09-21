import { type Request, type Response, type NextFunction } from "express";
import redisClient from "../../db/redisClient.ts";

const cacheMiddleware = (keyPrefix: string, ttl: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    
    // Generate a unique cache key based on the request URL path
    const reqBody = req.body ? req.body : "";
    const key = `${keyPrefix}:${req.originalUrl}-${JSON.stringify(reqBody)}`; // Example key generation

    try {
      // Get data from Redis using the cache key
      const cachedData = await redisClient.get(key);

      // Check if the data is available
      if (cachedData) {
        console.log(`⚡ Cache HIT for key: ${key}`);
        return res.status(200).json(JSON.parse(cachedData));
      }
      console.log(`❌ Cache MISS for key: ${key}. Fetching from source...`);
    
      // Intercept res.json() to cache the response
      const originalJson = res.json;
      res.json = function (body: any): Response {

        // Only cache successful JSON or string responses
        if (res.statusCode >= 200 && res.statusCode < 300 && body) {
          try {
            // Check if body is already a string, otherwise stringify it
            const dataToCache = JSON.stringify(body);

            // Save data to Redis with an expiration time (TTL)
            redisClient.setEx(key, ttl, dataToCache)
              .catch(err => console.error('Redis save error:', err));

          } catch (error) {
            console.error('Error serialization for Redis:', error);
          }
        }
        
        return originalJson.call(this, body);

      };
      next();
      
    } catch (error) {
      console.error("Cache middleware error:", error);
      next(); // Continue to the route handler even if caching fails
    }
  };
};

export default cacheMiddleware;