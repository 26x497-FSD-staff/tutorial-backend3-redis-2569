import { Router, type Request, type Response } from "express";

import { dbClient } from "@db/client.js";
import { userTable } from "@db/schema.js";
import { sql } from "drizzle-orm";

import cacheMiddleware from "../middlewares/cacheMiddleware.ts"

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const router = Router();

// Query users
router.get("/", cacheMiddleware('user',15), async (req, res, next) => {
  try {

    await delay(1500);

    const email = req.body?.email;
    const role = req.body?.role;

    if (!email && !role) {
      const results = await dbClient.query.userTable.findMany();
      res.json({
        length: results.length,
        data: results
      });
    } else if (email && !role) {
      const results = await dbClient.query.userTable.findFirst({
        where: (userTable, {eq}) => eq(userTable.email, email),
      });
      res.json(results);
    } else if (!email && role) {
      const results = await dbClient
        .select()
        .from(userTable)
        .where(sql`${userTable.metadata}->>'role' = ${role}`);
      
        res.json({
          length: results.length,
          data: results
        });
    }
    
  } catch (err) {
    next(err);
  }
});

// Insert a user
router.put("/", async (req, res, next) => {
  try {
    
    const email = req.body.email
    const displayName = req.body.displayName;
    const metadata = req.body.metadata;

    const result = await dbClient
      .insert(userTable)
      .values({
        email: email,
        displayName: displayName,
        metadata: metadata
      })
      .returning({ 
        id: userTable.id,
        email: userTable.email, 
        displayName: userTable.displayName,
        metadata: userTable.metadata
      });
    res.json({ msg: `Insert successfully`, data: result[0] });
  } catch (err) {
    next(err);
  }
});


router.post("/reset", async (req, res, next) => {
  try {
    await dbClient.delete(userTable);
    res.json({
      msg: `Delete all users successfully`,
      data: {},
    });
  } catch (err) {
    next(err);
  }
});

export default router;