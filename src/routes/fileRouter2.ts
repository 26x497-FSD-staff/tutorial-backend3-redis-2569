import express, {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  minioClient,
  BUCKET_NAME,
  initMinIO,
} from "../../minio/minioClient.ts";
import * as Minio from "minio";

import multer from "multer";
import path from "path";

import { dbClient } from "@db/client.js";
import { fileTable } from "@db/schema.js";
import { eq } from "drizzle-orm";

import cacheMiddleware from "../middlewares/cacheMiddleware.ts"

import redisClient from "../../db/redisClient.ts";


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import dotenv from "dotenv";
dotenv.config();

const router = Router();

// Configure multer to hold files in memory buffers instead of writing to local disk
// memoryStorage() does not support filename pattern configuration.
const storage = multer.memoryStorage();

// Filter files to allow only images
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = /jpeg|jpg|png|webp|pdf/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(
    new Error("Only web image formats (JPEG, PNG, WEBP) and PDF are allowed!"),
  );
};

// Limite file size to 10MB
const fileSize = 10 * 1024 * 1024;

const PORT = process.env.PORT || 3000;

// Configure multer
const upload = multer({
  storage,
  limits: { fileSize: fileSize },
  fileFilter,
});


// GET /v2/file/view/:filename - Endpoint to access file (Streams object safely from storage)
router.get(
  "/view/:filename",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // add async delay
      // await delay(1000);
      const filename = req.params.filename as string;

      // Fetch object metadata to get the original content type
      const stat = await minioClient.statObject(BUCKET_NAME, filename);
      res.setHeader("Content-Type", stat.metaData["content-type"]);

      // Stream the image file directly to the client response
      const dataStream = await minioClient.getObject(BUCKET_NAME, filename);
      dataStream.pipe(res);
    } catch (error: any) {
      if (error.code === "NoSuchKey") {
        res.status(404).json({ error: "File not found." });
        return;
      }
      next(error);
    }
  },
);

import { Readable } from 'stream'

// GET /v2/file/view3/:filename - with redis-cache for datastream
router.get(
  "/view3/:filename",
  async (req: Request, res: Response, next: NextFunction) => {
    // add async delay
    const filename = req.params.filename as string;
    const key = `minio:v3:stat:${filename}`;

    try {
      // 1. Check Redis for the cached file buffer (stored as base64 string)
      const cachedFileBase64 = await redisClient.get(key);

      if (cachedFileBase64) {
        console.log('⚡Cache HIT : Serving from Redis');
        
        const fileBuffer = Buffer.from(cachedFileBase64, 'base64');
        
        // Optional: Set appropriate headers if you cache content-type elsewhere
        const contentType = await redisClient.get(`${key}:Content-Type`) as string
        res.setHeader('Content-Type', contentType);
        
        // Turn the buffer back into a stream and pipe it to the response
        return Readable.from(fileBuffer).pipe(res);
      }
      console.log(`❌ Cache MISS. Fetching from minio-server`);

      // 2. Fallback to MinIO if cache misses (Cache Miss)
      const stat = await minioClient.statObject(BUCKET_NAME, filename);
      res.setHeader("Content-Type", stat.metaData["content-type"]);

      // Stream the image file directly to the client response
      const dataStream = await minioClient.getObject(BUCKET_NAME, filename);

      // 3. Read the incoming stream into a collection of chunks (Buffer)
      const chunks: Buffer[] = [];
      
      dataStream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        res.write(chunk); // Pipe to client immediately so the user doesn't wait
      });

      dataStream.on('end', async () => {
        res.end(); // Finish the client response

        // 4. Combine chunks and save to Redis in the background
        const completeBuffer = Buffer.concat(chunks);
        const base64String = completeBuffer.toString('base64');
        
        // Store in Redis (expires in 1 hour / 3600 seconds)
        await redisClient.setEx(key, 30, base64String);
        await redisClient.setEx(`${key}:Content-Type`, 30, stat.metaData["content-type"]);
      });

      dataStream.pipe(res);

    } catch (error: any) {
      if (error.code === "NoSuchKey") {
        res.status(404).json({ error: "File not found." });
        return;
      }
      next(error);
    }
  },
);

// GET /v2/file/view2/:filename - with redis-cache for presignedURL
router.get('/view2/:filename', async (req: Request, res: Response, next: NextFunction) => {
  // add async delay
    const filename = req.params.filename as string;
    const key = `minio:v2:stat:${filename}`;

  try {
    // 1. Check Redis cache first (Cache Hit)
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      console.log('⚡Cache HIT : Serving from Redis');
      return res.status(200).json({
        source: 'redis-cache',
        data: JSON.parse(cachedData),
      });
    }
    console.log(`❌ Cache MISS. Fetching from minio-server`);

    // 2. Fallback to MinIO if cache misses (Cache Miss)
    const stat = await minioClient.statObject(BUCKET_NAME, filename);
    
    // Generate a presigned URL valid for 1 hour
    const presignedUrl = await minioClient.presignedGetObject(BUCKET_NAME, filename, 3600);

    const result = {
      stat,
      presignedUrl,
    };

    // 3. Store the result in Redis with an expiration time (e.g., 300 seconds / 5 minutes)
    await redisClient.setEx(key, 30, JSON.stringify(result));

    return res.status(200).json({
      source: 'minio-server',
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});


// GET /v2/file?prefix=xxx&suffix=yyy - Endpoint to list files
router.get("/", cacheMiddleware('file',30), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // add async delay
    await delay(1500);

    // Optional: filter by virtual folder path (e.g., /list?prefix=avatars/)
    const prefix = (req.query.prefix as string) || ""; // folder in a bucket
    const suffix = (req.query.suffix as string) || ""; // e.g., "png" or "pdf"

    // Create an object stream from MinIO
    // Set recursive to true to list items inside subdirectories
    const stream = minioClient.listObjectsV2(BUCKET_NAME, prefix, true);

    const objects: Minio.BucketItem[] = [];

    // Collect stream data chunks into an array
    stream.on("data", (obj) => {
      // filter by suffix (.png, .pdf)
      if (
        obj.name &&
        obj.name.toLowerCase().endsWith(`.${suffix.toLowerCase()}`)
      ) {
        objects.push(obj);
      } else if (!suffix) {
        objects.push(obj);
      }
    });

    // Handle stream conclusion and return data
    stream.on("end", () => {
      res.status(200).json({
        count: objects.length,
        prefix: prefix || null,
        files: objects.map((file) => ({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          etag: file.etag,
        })),
      });
    });

    // Handle internal stream connection errors
    stream.on("error", (err) => {
      next(err);
    });
  } catch (error) {
    next(error);
  }
});


// Insert endpoints below
// POST /v2/file/upload - Endpoint to handle file upload
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<any> => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No image or pdf file provided." });
      }

      // Generate a unique object name to prevent file collisions
      const fileExtension = path.extname(req.file.originalname);
      const filename = path.parse(req.file.originalname).name;
      const cleanFilename = filename.replace(/\s+/g, "_").toLowerCase();
      // console.log(cleanFilename);

      // use itemId as a folder to store the object
      const itemId = req.body.itemId;
      const objectName = `${itemId}/${cleanFilename}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExtension}`;

      // Upload buffer data directly to MinIO
      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        {
          // metadata for rendering
          "Content-Type": req.file.mimetype,
          itemId: itemId,
        },
      );

      // add filename to file table
      const result = await dbClient
        .insert(fileTable)
        .values({
          filename: objectName,
          itemId: itemId,
        })
        .returning({ id: fileTable.id, itemId: fileTable.itemId });

      return res.status(201).json({
        message: "Image uploaded successfully",
        id: result[0].id,
        itemId: result[0].itemId,
        fileName: objectName,
        viewUrl: `http://localhost:${PORT}/v2/file/view/${encodeURIComponent(objectName)}`,
      });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ error: "Failed to upload image." });
    }
  },
);

// DELETE /v2/file/folder/*filePath - Endpoint to delete an file
router.delete(
  "/folder/*filePath",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Example URL: /v2/file/folder/xxxxx/image.png
      // Result: req.params.filePath = ['xxxxx', 'image.png']
      const filePath = req.params.filePath;
      console.log(filePath);

      if (!filePath || filePath.length === 0) {
        res.status(400).json({ error: "No file path provided." });
        return;
      }

      // Re-combine segments with forward slashes for MinIO
      const fullStoragePath = Array.isArray(filePath)
        ? filePath.join("/")
        : filePath; // Fallback if parsed as a string in certain setups

      console.log(fullStoragePath);

      // Check if the object exists before attempting deletion
      try {
        await minioClient.statObject(BUCKET_NAME, fullStoragePath);
      } catch (statError: any) {
        res.status(404).json({
          msg: "File not found in storage.",
          error: statError,
        });
        return;
        throw statError; // Pass any other internal MinIO errors down
      }

      // Delete the object from the MinIO bucket
      await minioClient.removeObject(BUCKET_NAME, fullStoragePath);

      await dbClient.delete(fileTable).where(eq(fileTable.filename, fullStoragePath));

      // Return successful response
      res.status(200).json({
        message: "Image deleted successfully",
        filename: fullStoragePath,
      });
    } catch (error) {
      next(error); // Forwards to your global error handler
    }
  },
);


// Global Error Handler
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// Initialize storage configuration and start server
try {
  await initMinIO();
} catch (err) {
  console.error("Failed to initialize MinIO storage client:", err);
}

export default router;