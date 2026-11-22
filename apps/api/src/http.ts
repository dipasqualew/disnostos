import { DataError } from "./data/errors";

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const noContent = () => new Response(null, { status: 204 });

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DataError(400, "Body must be valid JSON");
  }
}
