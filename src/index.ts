import "dotenv/config";
import { dbClient } from "@db/client.js";
import { taskTable, todoTable, userTable } from "@db/schema.js";
import cors from "cors";
import Debug from "debug";
import { eq, sql } from "drizzle-orm";
import type { ErrorRequestHandler } from "express";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
const debug = Debug("pf-backend");

import { jsonErrorHandler } from "./middlewares/jsonErrorHandler.ts";

// import routers
import todoRouter from "./routes/todoRouter.ts";
import userRouter from "./routes/userRouter.ts";
import fileRouter1 from "./routes/fileRouter1.ts"   // local filesystem
import fileRouter2 from "./routes/fileRouter2.ts"   // minio obs

//Intializing the express app
const app = express();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

//Middleware
app.use(morgan("dev", { immediate: false }));
app.use(helmet());
app.use(
  cors({
    origin: false, // Disable CORS
    // origin: "*", // Allow all origins
  }),
);
// Extracts the entire body portion of an incoming request stream and exposes it on req.body.
app.use(express.json());

// use routers
app.use('/todo',todoRouter);
app.use('/user',userRouter);
app.use('/file',fileRouter1);
app.use('/v2/file',fileRouter2);

// JSON Error Middleware
app.use(jsonErrorHandler);

// Running app
const PORT = process.env.PORT || 3000;
// * Running app
app.listen(PORT, async () => {
  debug(`Listening on port ${PORT}: http://localhost:${PORT}`);
});
