import { NextRequest, NextResponse } from "next/server";
import {
  MIN_SETUP_PASSWORD_LENGTH,
  SETUP_TOKEN_QUERY,
  applySetupPassword,
  setupTokenIsValid,
} from "@/lib/auth/password-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function page(opts: { token: string; error?: string; success?: boolean }): NextResponse {
  const errorHtml = opts.error
    ? `<p class="error">${opts.error}</p>`
    : "";
  if (opts.success) {
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ThumbGen — mot de passe enregistré</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0E0E13; color: #fff;
      font-family: Arial, Helvetica, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .box {
      background: #212126; border-radius: 16px; padding: 40px; width: 100%; max-width: 420px;
      border: 1px solid #353539;
    }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 12px; }
    p { font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.45; }
    a { color: #6EDDB3; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Mot de passe enregistré</h1>
    <p>Le lien à usage unique est maintenant invalide. L’application redémarre quelques secondes — reconnecte-toi ensuite sur <a href="/">la page d’accueil</a> avec ton nouveau mot de passe.</p>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ThumbGen — définir le mot de passe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0E0E13; color: #fff;
      font-family: Arial, Helvetica, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .box {
      background: #212126; border-radius: 16px; padding: 40px; width: 100%; max-width: 420px;
      border: 1px solid #353539;
    }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
    .hint { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 24px; }
    label { display: block; font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 6px; }
    input {
      width: 100%; padding: 12px 16px; background: #353539; border: 1px solid transparent;
      border-radius: 12px; color: #fff; font-size: 14px; outline: none; margin-bottom: 16px;
    }
    input:focus { border-color: #6EDDB3; }
    button {
      width: 100%; padding: 12px; background: #F7FFA8; color: #0E0E13; border: none;
      border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    button:hover { opacity: 0.9; }
    .error { color: #EF9092; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Choisir le mot de passe</h1>
    <p class="hint">Ce lien ne fonctionne qu’une seule fois. Minimum ${MIN_SETUP_PASSWORD_LENGTH} caractères.</p>
    ${errorHtml}
    <form method="POST" action="/definir-mot-de-passe">
      <input type="hidden" name="${SETUP_TOKEN_QUERY}" value="${escapeAttr(opts.token)}" />
      <label for="password">Nouveau mot de passe</label>
      <input type="password" id="password" name="password" minlength="${MIN_SETUP_PASSWORD_LENGTH}" required autofocus autocomplete="new-password" />
      <label for="confirm">Confirmer</label>
      <input type="password" id="confirm" name="confirm" minlength="${MIN_SETUP_PASSWORD_LENGTH}" required autocomplete="new-password" />
      <button type="submit">Enregistrer</button>
    </form>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get(SETUP_TOKEN_QUERY) ?? "";
  if (!setupTokenIsValid(token)) return notFound();
  return page({ token });
}

export async function POST(request: NextRequest) {
  let token = "";
  let password = "";
  let confirm = "";
  try {
    const form = await request.formData();
    token = String(form.get(SETUP_TOKEN_QUERY) ?? "");
    password = String(form.get("password") ?? "");
    confirm = String(form.get("confirm") ?? "");
  } catch {
    return notFound();
  }

  // Validate token before reading outcome — wrong/used token stays 404 (no form leak).
  if (!setupTokenIsValid(token)) return notFound();

  const result = applySetupPassword({ token, password, confirm });
  if (!result.ok) {
    const messages: Record<typeof result.error, string> = {
      token: "",
      missing: "Saisis le mot de passe et sa confirmation.",
      short: `Le mot de passe doit faire au moins ${MIN_SETUP_PASSWORD_LENGTH} caractères.`,
      mismatch: "Les deux mots de passe ne correspondent pas.",
    };
    if (result.error === "token") return notFound();
    // Mismatch / short: keep token valid so the user can retry.
    return page({ token, error: messages[result.error] });
  }

  // Restart so entrypoint reloads SITE_PASSWORD and clears the setup-hash env.
  if (!process.env.VITEST) {
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }

  return page({ token: "", success: true });
}
