import { redirect } from "next/navigation";

// The gallery is the entry point: you pick (or create) a miniature before
// landing in a canvas, instead of silently reopening whatever was last used.
export default function Home() {
  redirect("/miniatures");
}
