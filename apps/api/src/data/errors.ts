/** Failures the HTTP layer maps to a status. Anything else is a 500. */
export class DataError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 413 | 415,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = () => new DataError(404, "Not Found");
export const conflict = (message: string) => new DataError(409, message);
export const invalid = (message: string, details?: unknown) =>
  new DataError(400, message, details);
