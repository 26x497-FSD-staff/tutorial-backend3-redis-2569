import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// Ensure you have a 32-byte (256-bit) key in your environment variables
const ENCRYPTION_KEY = Buffer.from(process.env.DB_ENCRYPTION_KEY || "", "hex");
const IV_LENGTH = 12; // Standard for GCM
const TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encryptedData
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

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
