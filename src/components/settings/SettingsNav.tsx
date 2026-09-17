"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SETTINGS_SECTIONS, activeSectionSlug, isSettingsSectionSlug } from "./sections";

const SECTION_ITEMS = SETTINGS_SECTIONS.map((section) => ({ value: section.slug, label: section.label }));

export default function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeSectionSlug(pathname);

  return (
    <div className="min-w-0">
      <div className="md:hidden">
        <Select
          items={SECTION_ITEMS}
          value={active}
          onValueChange={(value) => {
            if (value && isSettingsSectionSlug(value)) router.push(`/reglages/${value}`);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Section des réglages">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTION_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav aria-label="Sections des réglages" className="hidden md:block">
        <ul className="grid gap-1">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.slug === active;
            return (
              <li key={section.slug}>
                <Link
                  href={`/reglages/${section.slug}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "w-full justify-start")}
                >
                  <Icon />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
