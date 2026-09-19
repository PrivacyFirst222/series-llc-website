import { ApiError } from "./api";

export function loginErrorMessage(error: unknown, office = false): string {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 429) return "Too many attempts. Try again in a few minutes.";
  if (status === 401) return office ? "Incorrect password." : "Incorrect email or password.";
  if (status === 400) return office ? "Enter your password." : "Enter a valid email address and your password.";
  return status ? "Something went wrong on our end. Please try again." : "We could not reach the server. Check your connection and try again.";
}
