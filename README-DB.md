# Database Design Tutorial

This is a `Database Tutorial` guideline for the `Database design` module.
We will continue from the [pf-backend](https://github.com/fullstack-69/pf-backend.git) project.

---

## Contents

- One-to-Many relationship with Drizzle
- Data Integrity with Foreign Key
- Using PostgreSQL to store NoSQL document
- Database Column Encryption
  - Text column encryption
  - Jsonb column encryption

---

## Project Setup

Clone the [pf-backend](https://github.com/fullstack-69/pf-backend.git) project.

```bash
pnpm install
pnpm approve-builds
```

This tutorial also requires a `PostgreSQL` database. We can use the [pf-db](https://github.com/fullstack-69/pf-db.git) project to initialize a PostgreSQL container.

This project also includes `compose-postgres.yml`, a compose file for initializing PostgreSQL database container. Before activate the compose file, make sure to edit `.env` file to set all necessary variables.

```bash
# Backend application port
PORT=3000

# Notice that we do not need superuser credential anymore.
POSTGRES_PASSWORD=
POSTGRES_USER=postgres
POSTGRES_DB=mydb
POSTGRES_PORT=5432
POSTGRES_HOST=localhost
POSTGRES_APP_USER=
POSTGRES_APP_PASSWORD=

# Database encryption
# https://generate-random.org/encryption-keys
DB_ENCRYPTION_KEY=05dcc5d17d405187d2934bd1fade54e69c3a5fbfae0a398ff49ad8e05429e784
```

After that, we can start our PostgreSQL container with this command.

```bash
docker compose -f compose-postgres.yml up -d
```

---

## One-to-Many Relationship with Drizzle

From the `pf-backend` project, we will modify our database as following:

![more tables](./img/db2.png)

We will allow a `todo` item to have multiple `sub-task`. In order to do that we need to modify `drizzle schema` in the file `./db/schema.ts` by adding the following code:

```typescript
// 2. Define the TASK table with a foreign key referencing the TODO table
export const taskTable = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskText: varchar("task_text", { length: 255 }).notNull(),
  isDone: boolean("is_done").default(false),
  todoId: uuid("todo_id")
    .notNull()
    .references(() => todoTable.id, { onDelete: "cascade" }), // Automatically deletes TASK if the TODO is deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).$onUpdate(
    () => new Date(),
  ),
});

// 3. Define the One-to-Many relationships
export const todoRelations = relations(todoTable, ({ many }) => ({
  tasks: many(taskTable), // One Todo can have many Tasks
}));

export const taskRelations = relations(taskTable, ({ one }) => ({
  todo: one(todoTable, {
    fields: [taskTable.todoId], // The foreign key column in the TASK table
    references: [todoTable.id], // The primary key column in the TODO table
  }),
}));
```

**Note:**

- The `taskTable.todoId` is a `foreign key` that enforce `one-to-many` relationship between a `todo` with a list of `tasks`.
- `{ onDelete: 'cascade' }` is defined on the `foreign key`, deleting the parent `todo` item will automatically delete all associated `tasks` in a single database operation.

### Apply schema changes

```bash
pnpm run db:push
```

---

## Add new prototype functions

Create new functions as prototype in the file `./db/prototype.ts` as following:

```typescript
// Insert a new task under specified todo item (by todoId)
async function insertTaskData(todo_id: string) {
  await dbClient.insert(taskTable).values({
    taskText: `Task - ${new Date()}`, // create taskText using Date() function
    todoId: todo_id,
  });
  dbConn.end();
}

// Get all todo items along with their sub tasks
async function queryWithTaskData() {
  const results = await dbClient.query.todoTable.findMany({
    with: { tasks: true }, // also get its sub tasks
  });
  console.log(results);
  dbConn.end();
}
```

At the end of the file add some function calls to test above functions.

```typescript
// insert a task under specified todoId
insertTaskData("3c7ad5bd-8b12-48a2-bc2f-eca58bc72e71");

// get all todo items along with their tasks
// queryWithTaskData();
```

Run the prototype operatons:

```bash
pnpm run db:prototype
```

---

### Add new API endpoints

We will add `PUT /todo/task` endpoint for inserting a new task under specified todo item.

```typescript
// PUT /todo/task - Insert a task to a specified todo item
app.put("/todo/task", async (req, res, next) => {
  try {
    const taskText = req.body.taskText ?? "";
    const todoId = req.body.todoId;
    if (!taskText) throw new Error("Empty todoText");

    const result = await dbClient
      .insert(taskTable)
      .values({
        taskText,
        todoId,
      })
      .returning({
        id: taskTable.id,
        taskText: taskTable.taskText,
        todoId: taskTable.todoId,
      });
    res.json({ msg: `Insert successfully`, data: result[0] });
  } catch (err) {
    next(err);
  }
});
```

This endpoint read the value of `taskText` and `todoId` from JSON body.

We need to modify `GET /todo` to make it returns all `todo` items along with their `tasks` by using the following code.

```typescript
// GET /todo - Query todo
try {
  // const results = await dbClient.query.todoTable.findMany();

  const results = await dbClient.query.todoTable.findMany({
    with: { tasks: true}
  });

  ...
}
```

The `DELETE /todo` endpoint **stays the same** since deleting a todo item will automatically delete its tasks. Now, we can use Insomnia client to test the new endpoints.

---

## Data Integrity with Foreign Key

After adding a `foreign key` in our database schema, we have also implemented this feature into `GET /todo` and `DELETE /todo` we can now test them.

1. Resetting our TODO database by make a request to `POST /todo/all` to delete all todo data.

```json
// Response from POST /todo/all
{
  "msg": "Delete all rows successfully",
  "data": {}
}
```

2. Create some todo items via `PUT /todo`.

```json
// Example response from PUT /todo
{
  "msg": "Insert successfully",
  "data": {
    "id": "870050c7-fa64-4313-af37-958b96d17ea6",
    "todoText": "Todo item #2"
  }
}
```

Make sure to make a copy of the `id`. We will use them when adding a sub `task` under this `todo` item.

3. Check out all `todo` items that we have added to the database by making a request to `GET /todo`.

```json
[
  {
    "id": "ce3931b7-797f-47fd-88cd-6157c31487e8",
    "todoText": "Todo item #1",
    "isDone": false,
    "createdAt": "2026-07-28T07:07:53.607Z",
    "updatedAt": "2026-07-28T00:07:53.599Z",
    "tasks": []
  },
  {
    "id": "870050c7-fa64-4313-af37-958b96d17ea6",
    "todoText": "Todo item #2",
    "isDone": false,
    "createdAt": "2026-07-28T07:08:47.839Z",
    "updatedAt": "2026-07-28T00:08:47.830Z",
    "tasks": []
  }
]
```

Note that the `tasks` under each `todo` items is empty.

4. Now we can add sub `task` under a specified `todo` item by using todo's `id`. Try making a request to `PUT /todo/task` endpoint.

```json
\\ JSON body of request
{
	"todoId": "870050c7-fa64-4313-af37-958b96d17ea6",
	"taskText": "sub task #{% now 'iso-8601', '' %} "
}
```

This includes `iso-8601 timestamp` as part of `taskText`. We can send this request multiple times to create multiple `tasks`.

5. Try making a request to `GET /todo` again.

```json
// Example of response from `GET /todo`
[
  {
    "id": "ce3931b7-797f-47fd-88cd-6157c31487e8",
    "todoText": "Todo item #1",
    "isDone": false,
    "createdAt": "2026-07-28T07:07:53.607Z",
    "updatedAt": "2026-07-28T00:07:53.599Z",
    "tasks": []
  },
  {
    "id": "870050c7-fa64-4313-af37-958b96d17ea6",
    "todoText": "Todo item #2",
    "isDone": false,
    "createdAt": "2026-07-28T07:08:47.839Z",
    "updatedAt": "2026-07-28T00:08:47.830Z",
    "tasks": [
      {
        "id": "2200daa9-f9b0-4096-bfaf-a2da9ac01dc3",
        "taskText": "sub task #2026-07-28T00:23:48.566Z ",
        "isDone": false,
        "todoId": "870050c7-fa64-4313-af37-958b96d17ea6",
        "createdAt": "2026-07-28T07:23:48.580Z",
        "updatedAt": "2026-07-28T00:23:48.572Z"
      },
      {
        "id": "00a6f665-a861-435a-ba38-9deb66488d49",
        "taskText": "sub task #2026-07-28T00:23:59.156Z ",
        "isDone": false,
        "todoId": "870050c7-fa64-4313-af37-958b96d17ea6",
        "createdAt": "2026-07-28T07:23:59.166Z",
        "updatedAt": "2026-07-28T00:23:59.158Z"
      }
    ]
  }
]
```

6. Try making a request to `PUT /todo/task` again with **INVALID** todo's `id`.

```json
\\ JSON body of request
{
	"todoId": "870050c7-fa64-0000-0000-000000000000",
	"taskText": "sub task #{% now 'iso-8601', '' %} "
}
```

We should get a response with `error message`.

```json
{
  "message": "Failed query: insert into \"tasks\" (\"id\", \"task_text\", \"is_done\", \"todo_id\", \"created_at\", \"updated_at\") values (default, $1, default, $2, default, $3) returning \"id\", \"task_text\", \"todo_id\"\nparams: sub task #2026-07-28T00:30:31.119Z ,870050c7-fa64-0000-0000-000000000000,2026-07-28T00:30:31.119Z",
  "type": "Error",
  "stack": "Error: ..."
}
```

The insert operation was not allowed because we tried to refer a `task` to **non-existing** `todo` item.

7. To delete a `todo` item, we make a request to `DELETE /todo` endpoint with specified todo's `id`.

```json
\\ JSON body of request
{
	"id": "870050c7-fa64-4313-af37-958b96d17ea6"
}
```

This operation should delete the specified `todo` item along with its `task` items.

```json
// Example response from DELETE /todo
{
  "msg": "Delete successfully",
  "data": {
    "id": "870050c7-fa64-4313-af37-958b96d17ea6"
  }
}
```

8. Makes a request to `GET /todo` again to verify.

```json
[
  {
    "id": "ce3931b7-797f-47fd-88cd-6157c31487e8",
    "todoText": "Todo item #1",
    "isDone": false,
    "createdAt": "2026-07-28T07:07:53.607Z",
    "updatedAt": "2026-07-28T00:07:53.599Z",
    "tasks": []
  }
]
```

---

## Using PostgreSQL to store NoSQL document

![more tables](./img/db3.png)

By default, `PostgreSQL` database can be used to store `JSON` data as `jsonb` column. We will create a table to store `User` data.

1. Create a drizzle schema for the `userTable` in the file `./db/schema.ts` as followed.

```typescript
// Define UserMetadata interface
interface UserMetadata {
  name: string;
  role: "Leader" | "Member";
  isActive: boolean;
  address?: {
    street?: string;
    city: string;
  };
}

// 4. Define the USER table
export const userTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 100 }).notNull().unique(),
  displayName: varchar("displayName", { length: 30 }).notNull(),
  metadata: jsonb("metadata").$type<UserMetadata>(), // type enforcement in development process
  // .notNull()
  // .default({               // Option: setting default values
  //   name: 'john doe',
  //   role: 'Member',
  //   isActive: true
  // }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).$onUpdate(
    () => new Date(),
  ),
});
```

A `user` contains the follow columns:

- `email`: A user email (required, unique)
- `displayName`: User display name
- `metadata`: An object of data in JSON format
  - `name`: Full name
  - `role`: Role of the user (Leader or Member)
  - `isActive`: Is the user active?
  - `address`: street address, city name

Update the database schema with `pnpm run db:push` command.

2. Create `PUT /user` endpoint for inserting a new user.

Add the following code of `PUT /user` in the file `./index.ts`.

```typescript
// PUT /user - Insert a user
app.put("/user", async (req, res, next) => {
  try {
    const email = req.body.email;
    const displayName = req.body.displayName;
    const metadata = req.body.metadata;

    const result = await dbClient
      .insert(userTable)
      .values({
        email: email,
        displayName: displayName,
        metadata: metadata,
      })
      .returning({
        id: userTable.id,
        email: userTable.email,
        displayName: userTable.displayName,
        metadata: userTable.metadata,
      });
    res.json({ msg: `Insert successfully`, data: result[0] });
  } catch (err) {
    next(err);
  }
});
```

We can insert `metadata` as JSON object into the `userTable.metadata` column.

3. Test adding a new `user` by making request to the `PUT /user` endpoint.

```json
// Example of JSON body
{
  "email": "user1@abc.com",
  "displayName": "Apollo",
  "metadata": {
    "name": "Theo Ragna",
    "role": "Leader",
    "isActive": true,
    "address": {
      "city": "Chiang Mai"
    }
  }
}
```

If you use **Insomnia**, use can also use `faker data generator` plugin inside JSON body like this.

```json
// JSON body with fake data generator

{
	"email": "{% faker 'randomEmail' %}",
	"displayName": "{% faker 'randomUserName' %}",
	"metadata": {
		"name": "{% faker 'randomFullName' %}",
		"role": "Leader",
		"isActive": {% faker 'randomBoolean' %},
		"address" : {
			"city": "{% faker 'randomCity' %}",
			"street": "{% faker 'randomStreetAddress' %}"
		}
	}
}
```

We should get a response as shown below if it is successful.

```json
// Example of response from PUT /user
{
  "msg": "Insert successfully",
  "data": {
    "id": "4d73388d-68e8-4af8-b165-7230b5d58a90",
    "email": "user1@abc.com",
    "displayName": "Apollo",
    "metadata": {
      "name": "Theo Ragna",
      "role": "Leader",
      "address": {
        "city": "Chiang Mai"
      },
      "isActive": true
    }
  }
}
```

4. Create the `GET /user` endpoint for querying user information

Add the following code of `GET /user` in the file `./index.ts`.

```typescript
// import from drizzle-orm
import { eq, sql } from "drizzle-orm";

// GET /user - Query users
app.get("/user", async (req, res, next) => {
  try {
    const email = req.body.email;
    const role = req.body.role;

    if (!email && !role) {
      const results = await dbClient.query.userTable.findMany();
      res.json(results);
    } else if (email && !role) {
      const results = await dbClient.query.userTable.findFirst({
        where: (userTable, { eq }) => eq(userTable.email, email),
      });
      res.json(results);
    } else if (!email && role) {
      const results = await dbClient
        .select()
        .from(userTable)
        .where(sql`${userTable.metadata}->>'role' = ${role}`);
      res.json(results);
    }
  } catch (err) {
    next(err);
  }
});
```

Now we can test the `GET /user` endpoint with 3 different ways:

- Make a request without JSON body, return all users.
- Make a request with JSON body containing only an `email`, return a user with specified `email`.
- Make a request with JSON body containing only a `role`, return users with specified `role`.

---

## Database Column Encryption

In Drizzle ORM, you can achieve **application-level column encryption** by defining a `customType`.

- Automatically `encrypts` data before it writes to the database.
- `Decrypts` the data when read.
- This keeps your `application logic` completely decoupled from the `security layer`.

### Create Encryption Helper Functions

We use Node.js's native [crypto](https://www.w3schools.com/nodejs/nodejs_crypto.asp) module to handle the encryption and decryption processes securely using [AES-256-GCM](https://proton.me/th/learn/encryption/types-of-encryption/aes-encryption).

Create a file `./db/encryptionUtil.ts` and add the following codes.

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// Ensure you have a 32-byte (256-bit) key in your environment variables
const ENCRYPTION_KEY = Buffer.from(process.env.DB_ENCRYPTION_KEY || "", "hex");
const IV_LENGTH = 12; // Standard for GCM
const TAG_LENGTH = 16;

// String encryption function
export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encryptedData
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// String decription function
export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encryptedData] = encryptedText.split(":");
  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error("Invalid encrypted text format.");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

In order to use the above functions, we need to create `DB_ENCRYPTION_KEY` variable in the `.env` file.

```bash
# .env
DB_ENCRYPTION_KEY=<32-byte-key>
```

We can generate a `32-byte` (256-bit) encryption key from the [generate-random.org/encryption-keys](https://generate-random.org/encryption-keys).

### Define the Custom Encrypted Column Type

We will use Drizzle's `Custom Types` API to **intercept data flows**. The customType function manages transformations between the `driver data state` (encrypted string) and `runtime state` (plaintext string)

We will add `customType` at the end of the `./db/encryptionUtil.ts` as the following.

```typescript
// Using Drizzle's Custom Type API to intercept data flows.
import { customType } from "drizzle-orm/pg-core";

// Create the Custom Encrypted text Type
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text"; // Database stores it as a raw text string
  },
  toDriver(value: string): string {
    return encrypt(value); // Encrypts before sending to DB
  },
  fromDriver(value: string): string {
    return decrypt(value); // Decrypts when fetched from DB
  },
});
```

Note that whichever database column uses `encryptedText` custom type, the database type of that column will become `text`.

### Apply to the Database Schema

We need to modify our database schema in the file `./db/schema.ts` so that the sensitive columns will be encrypted using the `encryptedTest` custom type.

In the `todoTable`, we might want to encrypt the `todoText` column. We can modify the schema as followed.

```typescript
// ./db/schema.ts

// import customType
import { encryptedText } from "./encryptionUtil.ts";

export const todoTable = pgTable("todo", {
  ...

  // encrypts & decrypts todoText
  todoText: encryptedText("todo_text").notNull(),

	...
});
```

In the `taskTable`, we also want to encrypt the `taskText` column.

```typescript
export const taskTable = pgTable('tasks', {
  ...
  // encrypt & decrypts taskText
  taskText: encryptedText('task_text').notNull(),

	...
});
```

#### Trade-offs

- **No Database-Level Indexing/Querying**: Because data is randomized by initialization vectors (IVs) prior to saving, `encryptedText` cannot be safely queried using precise matches (`eq`) or pattern matches (`like`) via plain SQL.
- **Filtering Requirements**: If you must query or filter by an encrypted field, you must pull the records into application memory first.
  - Or use a specialized cryptographic platform extension like `CipherStash` with `Drizzle` to preserve query features.

### Test with API

Now we can test the **application-side column encyption** by creating new `todo` items and `task` items.

After that, use a database client (e.g. `DBeaver`) to view data stored in the database. We shoud see that the data in the `todoText` and `taskText` are now encrypted.

### Jsonb Encryption

Similary, we need to build a `custom data type` mapped to a database `text`, rather than the native `jsonb()` column type.

In this example, we will encrypt the `metadata` jsonb column in the `userTable`.

We will add an `encryptedJsonb` customType at the end of the file `./db/encryptionUtil.ts` as followed.

```typescript
// Create the Custom Encrypted JSONB Type
export const encryptedJsonb = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      // Maps to a text column in Postgres to hold the encrypted string token safely
      return "text";
    },
    toDriver(value: TData): string {
      // Serialize the TypeScript object to a JSON string and encrypt it
      const stringified = JSON.stringify(value);
      return encrypt(stringified);
    },
    fromDriver(value: string): TData {
      // Decrypt the string token and parse it back into a type-safe object
      const decrypted = decrypt(value);
      return JSON.parse(decrypted) as TData;
    },
  })(name);
```

The `TData` type is a **TypeScript generic type parameter** that represents the shape of your unencrypted JavaScript/TypeScript `object`.

We will apply the `encryptedJson` customType with the `metadata` column in the `userTable` schema.

```typescript
export const userTable = pgTable("users", {
  ...

  // encrypts & decrypts metadata JSON object
  metadata: encryptedJsonb<UserMetadata>('metadata').notNull(),

  ...
});
```

### Test Jsonb encryption with API

Now we can test the **jsonb encyption** by creating a new `user` along with its `metadata` .

After that, use a database client (e.g. `DBeaver`) to view data stored in the database. We shoud see that the data of `metadata` is now encrypted.
