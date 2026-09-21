import {
  pgTable,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb
} from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';

// import customType
import { encryptedJsonb, encryptedText } from "./encryptionUtil.ts";

export const todoTable = pgTable("todo", {
  id: uuid("id").primaryKey().defaultRandom(),
  // todoText: varchar("todo_text", { length: 255 }).notNull(),
  todoText: encryptedText("todo_text").notNull(),
  isDone: boolean("is_done").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).$onUpdate(
    () => new Date()
  ),
});

// 2. Define the TASK table with a foreign key referencing the TODO table
export const taskTable = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  // taskText: varchar('task_text', { length:255 }).notNull(),
  taskText: encryptedText('task_text').notNull(),
  isDone: boolean("is_done").default(false),
  todoId: uuid('todo_id')
    .notNull()
    .references(() => todoTable.id, { onDelete: 'cascade' }), // Automatically deletes TASK if the TODO is deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).$onUpdate(
    () => new Date()
  )
});

// 3. Define the One-to-Many relationships : make db.query nested syntax work
// relation for todoTable
export const todoRelations = relations(todoTable, ({ many }) => ({
  tasks: many(taskTable),           // One Todo can have many Tasks
}));

// relation for taskTable
export const taskRelations = relations(taskTable, ({ one }) => ({
  todo: one(todoTable, {
    fields: [taskTable.todoId],     // The foreign key column in the TASK table
    references: [todoTable.id],     // The primary key column in the TODO table
  }),
}));

// Define UserMetadata interface
interface UserMetadata {
  name: string;
  role: "Leader" | "Member";
  isActive: boolean;
  address?: {
    street?: string;
    city:string;
  }
}

// 4. Define the USER table
export const userTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 100}).notNull().unique(),
  displayName: varchar("displayName", { length: 30 }).notNull(),
  // metadata: jsonb('metadata')
  //   .$type<UserMetadata>(),     // type enforcement in development process
    // .notNull()
    // .default({               // setting default values
    //   name: 'john doe',
    //   role: 'Member',
    //   isActive: true
    // }),

  // encrypted jsonb
  metadata: encryptedJsonb<UserMetadata>('metadata').notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).$onUpdate(
    () => new Date()
  ),
});

// Define the FILE table
export const fileTable = pgTable("file", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: varchar("filename", { length: 255 }).notNull(),
  itemId: uuid("item_id").notNull(), // ref to a todo or a task item
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).$onUpdate(
    () => new Date(),
  ),
});