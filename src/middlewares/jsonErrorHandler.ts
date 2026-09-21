import type { ErrorRequestHandler } from "express";
import Debug from "debug";

const debug = Debug("pf-backend");

// JSON Error Middleware
export const jsonErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  debug(err.message);
  const errorResponse = {
    message: err.message || "Internal Server Error",
    type: err.name || "Error",
    // stack: err.stack,
  };
  res.status(500).send(errorResponse);
};