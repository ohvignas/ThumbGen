import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const SITE_PASSWORD = process.env.SITE_PASSWORD;

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
  const path = request.nextUrl.pathname;
  if (path === "/api/mcp" || path.startsWith("/api/mcp/")) return NextResponse.next();

  // Check for auth cookie
  const authCookie = request.cookies.get("thumbgen_auth");
  if (authCookie?.value === SITE_PASSWORD) return NextResponse.next();

  // Check if this is a login POST
  if (
    request.nextUrl.pathname === "/login" &&
    request.method === "POST"
  ) {
    return NextResponse.next();
  }

  // Check query param login (simple approach)
  const passwordParam = request.nextUrl.searchParams.get("password");
  if (passwordParam === SITE_PASSWORD) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set("thumbgen_auth", SITE_PASSWORD, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return response;
  }

  // Show login page
  return new NextResponse(loginPage(), {
    status: 401,
    headers: { "Content-Type": "text/html" },
  });
}

function loginPage() {
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
      font-family: 'DM Sans', system-ui, sans-serif;
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
    .error { color: #EF9092; font-size: 12px; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>ThumbGen</h1>
    <p>Enter password to access the app</p>
    <form onsubmit="handleLogin(event)">
      <input type="password" id="password" placeholder="Password" autofocus />
      <button type="submit">Enter</button>
      <p class="error" id="error">Incorrect password</p>
    </form>
  </div>
  <script>
    function handleLogin(e) {
      e.preventDefault();
      const pw = document.getElementById('password').value;
      window.location.href = '/?password=' + encodeURIComponent(pw);
    }
  </script>
</body>
</html>`;
}

export const config = {
  matcher: [
    // Exclude static assets, the login page, and image-serving routes that
    // need to be reachable from <img src> tags without cookie auth.
    "/((?!_next/static|_next/image|favicon.ico|swipe-file|api/face-reactions/image|api/swipe-files/image|api/logos/image|api/generated-images/image|api/chat-uploads/[^/]+$).*)",
  ],
};
