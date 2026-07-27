import "server-only";
import postgres, { type Sql } from "postgres";

let client: Sql | undefined;

export function database(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseConfigurationError();
  }

  if (!client) {
    client = postgres(connectionString, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
      connection: { application_name: "keyflow" },
    });
  }

  return client;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is niet geconfigureerd.");
    this.name = "DatabaseConfigurationError";
  }
}
