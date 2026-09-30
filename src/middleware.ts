import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  authCookieVerifier,
  isValidAuthCookie,
  passwordMatches,
  shouldSecureCookie,
} from "@/lib/auth/site-session";
import { SETUP_TOKEN_QUERY, setupTokenMatchesHash } from "@/lib/auth/setup-token-edge";

export async function middleware(request: NextRequest) {
  const SITE_PASSWORD = process.env.SITE_PASSWORD;
  const path = request.nextUrl.pathname;

  // One-time password setup: open only while a setup-token hash is configured,
  // and (on GET) only when ?t= matches. No permanent open change route.
  if (path === "/definir-mot-de-passe") {
    const setupHash = process.env.SITE_PASSWORD_SETUP_TOKEN_HASH?.trim().toLowerCase() ?? "";
    if (!setupHash) {
      return new NextResponse("Not Found", { status: 404 });
    }
    if (request.method === "GET") {
      const token = request.nextUrl.searchParams.get(SETUP_TOKEN_QUERY) ?? "";
      if (!(await setupTokenMatchesHash(token, setupHash))) {
        return new NextResponse("Not Found", { status: 404 });
      }
    }
    // POST: do not read the body here (would consume it); the route re-checks the token.
    return NextResponse.next();
  }

  // Skip auth if no password is set
  if (!SITE_PASSWORD) return NextResponse.next();

  // API auth model (mono-user, single SITE_PASSWORD):
  //   /api/mcp           → bearer token (handled in the route itself)
  //   /api/<image>/image → public read (referenced from <img>, no cookie possible)
  //   everything else    → cookie auth, same as page routes
  // The /api/mcp route checks the bearer + Origin in its own handler. We let it
  // through here because cookies can't be used for cross-origin MCP clients.
  // Image-serving routes are exempted via the matcher below for the same reason
  // (cookies don't follow <img> requests reliably across all browsers).
  if (path === "/api/mcp" || path.startsWith("/api/mcp/")) return NextResponse.next();

  // Valid session cookie (verifier, not the raw password)
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (await isValidAuthCookie(authCookie?.value, SITE_PASSWORD)) {
    return NextResponse.next();
  }

  // Login via POST body — never accept ?password= (avoids history / Referer / URL logs).
  if (path === "/login" && request.method === "POST") {
    let password = "";
    try {
      const form = await request.formData();
      password = String(form.get("password") ?? "");
    } catch {
      password = "";
    }

    if (await passwordMatches(password, SITE_PASSWORD)) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.set(
        AUTH_COOKIE_NAME,
        await authCookieVerifier(SITE_PASSWORD),
        authCookieOptions(shouldSecureCookie(request)),
      );
      return response;
    }

    return new NextResponse(loginPage({ error: true }), {
      status: 401,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Show login page
  return new NextResponse(loginPage({ error: false }), {
    status: 401,
    headers: { "Content-Type": "text/html" },
  });
}

function loginPage({ error }: { error: boolean }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ThumbGen - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0E0E13;
      color: #fff;
      font-family: Arial, Helvetica, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .login-box {
      background: #212126;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 380px;
      border: 1px solid #353539;
    }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 24px; }
    input {
      width: 100%;
      padding: 12px 16px;
      background: #353539;
      border: 1px solid transparent;
      border-radius: 12px;
      color: #fff;
      font-size: 14px;
      outline: none;
      margin-bottom: 16px;
    }
    input:focus { border-color: #6EDDB3; }
    button {
      width: 100%;
      padding: 12px;
      background: #F7FFA8;
      color: #0E0E13;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { opacity: 0.9; }
    .error { color: #EF9092; font-size: 12px; margin-top: 8px; ${error ? "display: block;" : "display: none;"} }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>ThumbGen</h1>
    <p>Enter password to access the app</p>
    <form method="POST" action="/login">
      <input type="password" name="password" placeholder="Password" autofocus />
      <button type="submit">Enter</button>
      <p class="error" id="error">Incorrect password</p>
    </form>
  </div>
</body>
</html>`;
}

export const config = {
  matcher: [
    // Exclude static assets and image-serving routes that need to be reachable
    // from <img src> tags without cookie auth.
    "/((?!_next/static|_next/image|favicon.ico|swipe-file|api/face-reactions/image|api/swipe-files/image|api/logos/image|api/generated-images/image|api/personas/image|api/chat-uploads/[^/]+$|api/generated-sketches/[^/]+$).*)",
  ],
};
