import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "./auth-context";

/** 200 OK response */
export function ok<T>(data: T) {
  return NextResponse.json(data);
}

/** 201 Created response */
export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

/** Error response with status code */
export function error(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** 400 Validation error response */
export function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 404 Not found response */
export function notFound(entity = "Resource") {
  return NextResponse.json({ error: `${entity} not found` }, { status: 404 });
}

/** Standard error handler for catch blocks */
export function handleError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
