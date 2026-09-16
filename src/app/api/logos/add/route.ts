import { NextResponse } from "next/server";
import { z } from "zod";
import { LogoAddError, addLogoFromSearch } from "@/lib/logos/add-logo";
import { LOGO_SOURCES, type AddedLogo } from "@/lib/logos/shared";

export const runtime = "nodejs";

const AddLogoBodySchema = z.object({
  source: z.enum(LOGO_SOURCES),
  ref: z.string().min(1).max(1000),
  name: z.string().max(200),
});

export async function POST(request: Request) {
  const parsed = AddLogoBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Résultat de recherche invalide." }, { status: 400 });

  try {
    const logo = await addLogoFromSearch(parsed.data);
    const body: AddedLogo = { filename: logo.id, label: logo.label };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof LogoAddError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[logos/add] failed", error);
    return NextResponse.json({ error: "Ajout du logo impossible." }, { status: 500 });
  }
}
