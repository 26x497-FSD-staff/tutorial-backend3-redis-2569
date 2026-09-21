// ./minio/minioClient.ts
import * as Minio from "minio";
import dotenv from "dotenv";

dotenv.config();

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_API_PORT || "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "miniopassword",
});

export const BUCKET_NAME = process.env.MINIO_BUCKET || "my-app";

// Automatically ensure the bucket exists on application startup
export const initMinIO = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
      console.log(`Bucket "${BUCKET_NAME}" created successfully.`);
    }
    console.log(`Successfully connects to Minio bucket "${BUCKET_NAME}"`);
  } catch (err) {
    console.log(`Unable to connect to Minio`);
  }
};