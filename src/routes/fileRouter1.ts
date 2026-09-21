// ./src/routes/fileRouter_v1.ts

import express, {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

import { dbClient } from "@db/client.js";
import { fileTable } from "@db/schema.js";
import { eq } from "drizzle-orm";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const router = Router();

// Ensure the upload directory exists locally
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 1. Configure Multer Disk Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique timestamped file name
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// 2. Filter files to allow only images and pdf
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("application/pdf")
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only image and pdf files are allowed!"));
  }
};

const upload = multer({ storage, fileFilter });

// GET /file/view/:filename - Endpoint to access specific file
router.use("/view", express.static(uploadDir));

// GET /file - Endpoint to list all files
router.get("/", async (req: Request, res: Response): void => {
  // add async delay
  await delay(750);

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      res.status(500).json({ error: "Unable to scan directory structure" });
      return;
    }

    // Map files to include complete metadata and functional access URLs
    const fileList = files
      .map((file) => {
        const filePath = path.join(uploadDir, file);
        let stats;

        try {
          stats = fs.statSync(filePath);
        } catch (statErr) {
          return null; // Skip file if metadata reading fails
        }

        return {
          filename: file,
          url: `${req.protocol}://${req.get("host")}/file/view/${file}`,
          size: stats.size,
          createdAt: stats.birthtime,
        };
      })
      .filter(Boolean); // Filter out any null entries

    res.status(200).json({
      totalFiles: fileList.length,
      files: fileList,
    });
  });
});

// Insert endpoints' logic below
// POST /file/upload - Endpoint to handle file upload
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Please select an image file to upload." });
    }

    const itemId = req.body.itemId;
    const filename = req.file.filename;

    // add filename to fileTable
    const result = await dbClient
      .insert(fileTable)
      .values({
        filename,
        itemId,
      })
      .returning({ id: fileTable.id, itemId: fileTable.itemId });

    // Construct a public view URL for the client
    const fileUrl = `${req.protocol}://${req.get("host")}/file/view/${filename}`;

    res.status(201).json({
      message: "Image uploaded successfully!",
      id: result[0].id,
      itemId: result[0].itemId,
      filename: filename,
      size: req.file.size,
      url: fileUrl,
    });
  },
);

// DELETE /file/:filename - Endpoint to delete a specific file by name
router.delete("/:filename", (req: Request, res: Response): void => {
  const filename = req.params.filename as string;

  if (!filename) {
    res
      .status(400)
      .json({ error: "Filename parameter is required in the body" });
    return;
  }

  // Security check: Prevent directory traversal attacks (e.g., "../../etc/passwd")
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDir, safeFilename);

  // Verify file path belongs to the directory and exists
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  fs.unlink(filePath, async (err) => {
    if (err) {
      res.status(500).json({ error: "Failed to delete file" });
      return;
    }

    await dbClient.delete(fileTable).where(eq(fileTable.filename, filename));
    
    res
      .status(200)
      .json({ message: `File ${safeFilename} deleted successfully` });
  });
});

// POST Endpoint to delete ALL files in the directory
router.post("/reset", (req: Request, res: Response): void => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      res.status(500).json({ error: "Failed to read directory" });
      return;
    }

    if (files.length === 0) {
      res.status(200).json({ message: "Directory is already empty" });
      return;
    }

    // Map files to absolute paths
    const deletionPromises = files.map((file) => {
      return new Promise<void>((resolve, reject) => {
        fs.unlink(path.join(uploadDir, file), (unlinkErr) => {
          if (unlinkErr) reject(unlinkErr);
          else resolve();
        });
      });
    });

    // Execute all deletions concurrently
    Promise.all(deletionPromises)
      .then(async () => {

        await dbClient.delete(fileTable);

        res.status(200).json({
          message: "All files deleted successfully",
          count: files.length,
        });
      })
      .catch((error) => {
        res.status(500).json({ error: "Failed to delete some files cleanly" });
      });
  });
});

// Global Error Handler for handling Multer/Upload issues
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  res.status(400).json({ error: err.message });
});

export default router;