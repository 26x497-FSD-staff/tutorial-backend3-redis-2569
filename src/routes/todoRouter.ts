import { Router, type Request, type Response } from "express";

import { dbClient } from "@db/client.js";
import { taskTable, todoTable } from "@db/schema.js";
import { eq } from "drizzle-orm";

import cacheMiddleware from "../middlewares/cacheMiddleware.ts"

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const router = Router();

// Query todo items
router.get("/", cacheMiddleware('todo',15), async (req, res, next) => {
  try {
    await delay(2000);
    // const results = await dbClient.query.todoTable.findMany();
    const results = await dbClient.query.todoTable.findMany({
      with: { tasks: true}
    });

    res.status(200).json({
      length: results.length,
      data: results
    });
  } catch (err) {
    next(err);
  }
});


// Insert
router.put("/", async (req, res, next) => {
  try {
    const todoText = req.body.todoText ?? "";
    if (!todoText) throw new Error("Empty todoText");
    const result = await dbClient
      .insert(todoTable)
      .values({
        todoText,
      })
      .returning({ id: todoTable.id, todoText: todoTable.todoText });
    res.json({ msg: `Insert successfully`, data: result[0] });
  } catch (err) {
    next(err);
  }
});

// Update
router.patch("/", async (req, res, next) => {
  try {
    const id = req.body.id ?? "";
    const todoText = req.body.todoText ?? "";
    if (!todoText || !id) throw new Error("Empty todoText or id");

    // Check for existence if data
    const results = await dbClient.query.todoTable.findMany({
      where: eq(todoTable.id, id),
    });
    if (results.length === 0) throw new Error("Invalid id");

    const result = await dbClient
      .update(todoTable)
      .set({ todoText })
      .where(eq(todoTable.id, id))
      .returning({ id: todoTable.id, todoText: todoTable.todoText });
    res.json({ msg: `Update successfully`, data: result });
  } catch (err) {
    next(err);
  }
});

// Delete
router.delete("/", async (req, res, next) => {
  try {
    const id = req.body.id ?? "";
    if (!id) throw new Error("Empty id");

    // Check for existence if data
    const results = await dbClient.query.todoTable.findMany({
      where: eq(todoTable.id, id),
    });
    if (results.length === 0) throw new Error("Invalid id");

    await dbClient.delete(todoTable).where(eq(todoTable.id, id));
    
    res.json({
      msg: `Delete successfully`,
      data: { id },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/reset", async (req, res, next) => {
  try {
    await dbClient.delete(todoTable);
    res.json({
      msg: `Delete all todo items with sub tasks successfully`,
      data: [],
    });
  } catch (err) {
    next(err);
  }
});

// Insert a task to a todo item
router.put("/task", async (req, res, next) => {
  try {
    const taskText = req.body.taskText ?? "";
    const todoId = req.body.todoId;
    if (!taskText) throw new Error("Empty todoText");

    const result = await dbClient
      .insert(taskTable)
      .values({
        taskText,
        todoId
      })
      .returning({ id: taskTable.id, taskText: taskTable.taskText, todoId: taskTable.todoId });
    res.json({ msg: `Insert successfully`, data: result[0] });
  } catch (err) {
    next(err);
  }
});

export default router;