# Redis Cache

This is a `Redis Cache Tutorial` for the `Backend Architecture` module.
We will continue from the [File Storage Tutorial](https://github.com/26x497-FSD-staff/tutorial-backend2-minio-2569) project.

---

## Content

- Mockup slow API processing
- Setup Redis database
- Create Redis client
- Implement Redis-cache middleware

---

## Project Setup

Clone the [File Storage Tutorial](https://github.com/26x497-FSD-staff/tutorial-backend2-minio-2569) project.

```bash
pnpm install
pnpm approve-builds
```

---

## Mockup slow API processing

Previously from the [File Storage Tutorial], there are a few API endpoints that take a bit of time to get reponses.

- `GET /todo`
- `GET /user`
- `GET /v2/file`

In those endpoints, we have mocked the delay by using the `delay()` function. In order to lower the reponse time, we can add `cache` component to our API service.

---

## Setup Redis database

One way to implement cache component is using `Redis` in-memory database. Redis stores its data as `key:value` in the system memory (aka. RAM) allowing data query to be very fast. Redis also save a snapshot of its database to system storage (aka. SSD/HDD) every certain period of time.

Before starting `Redis` container with `docker compose`. We need to add the following environment variables in the `.env` file.

```bash
# Redis
REDIS_PASSWORD=...
REDIS_HOST=localhost
REDIS_PORT=6379
```

We can start a `Redis` container using the following command.

```bash
docker compose -f compose-redis.yml up -d
```

This `Redis` server is configured with `REDIS_PASSWORD` and will save database snapshot every `60` seconds if at least `1` write operation was performed.

To test the `Redis` server, we can run `redis-cli` inside the container to access `redis prompt` using this command.

```bash
docker exec -it redis_cache redis-cli -a <REDIS_PASSWORD>
```

After access a prompt `127.0.0.1:6379>`, we can test with following commands.

```bash
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET mykey data:/todo
OK
127.0.0.1:6379> GET mykey
"data:/todo"
127.0.0.1:6379> exit
```

---

## Create Redis client

Next step is to create a `Redis client` object that we can use to `SET` and `GET` data from our API. Create the file `db/redisClient.ts` with the following code.

```typescript
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
```

In general the `Redis URL` is of the pattern `redis://USERNAME:PASSWORD@HOST:PORT`. However, in this example we only provide a `REDIS_PASSWORD` without `username`.

---

## Implement Redis-cache middleware

Now we can create `Redis-cache` middleware using the `redisClient`. Create the file `src/middlewares/cacheMiddleware.ts` with the following code.

Make sure that the `cache keys` are uniquely generated for different requests. In general we can use the `origialUrl` of each request together with `params` and `body` values.

```typescript
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
```

In the final step, we will use the middleware with existing API endpoints. For example, we use the middleware with `GET /todo` endpoint by modify the file `src/routes/todoRouter.ts` as follow.

```typescript
// Query todo items
router.get("/", cacheMiddleware('todo',15), async (req, res, next) => {
  ...
});
```

we can also use the middleware with `GET /user` by modify the file `src/routes/userRouter.ts` as well.

```typescript
router.get("/", cacheMiddleware('user',15), async (req, res, next) => {
  ...
});
```

As for the `GET /v2/file` endpoint, we modify the file `src/routes/fileRouter_v2.ts`.

```typescript
// GET /v2/file?prefix=xxx&suffix=yyy - Endpoint to list files
router.get("/", cacheMiddleware('file',30), async (req: Request, res: Response, next: NextFunction) => {
  ...
});
````

Now we can get better `response time` on both endpoints when making the same request within `15` seconds.