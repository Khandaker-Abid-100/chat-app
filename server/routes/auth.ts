import { register, login } from "../auth";
import { checkRateLimit } from "../rateLimit";
import { corsHeaders } from "../middleware/cors";

function json(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export async function handleRegister(req: Request): Promise<Response> {
  const clientIp =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(`register:${clientIp}`)) {
    return json(
      { error: "Too many requests. Please wait 15 minutes." },
      429,
      req
    );
  }

  try {
    const { username, password } = await parseBody<{
      username: string;
      password: string;
    }>(req);
    const result = await register(username, password);
    return json(result, 201, req);
  } catch (err: any) {
    return json({ error: err.message }, 400, req);
  }
}

export async function handleLogin(req: Request): Promise<Response> {
  const clientIp =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(`login:${clientIp}`)) {
    return json(
      { error: "Too many requests. Please wait 15 minutes." },
      429,
      req
    );
  }

  try {
    const { username, password } = await parseBody<{
      username: string;
      password: string;
    }>(req);
    const result = await login(username, password);
    return json(result, 200, req);
  } catch (err: any) {
    return json({ error: err.message }, 401, req);
  }
}