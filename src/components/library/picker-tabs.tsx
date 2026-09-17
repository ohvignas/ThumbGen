import { LogoPickerGrid, LogoSearchPicker, PersonaPickerGrid, SwipePickerGrid } from "./picker-grids";
import FollowedChannelsPickerTab from "./followed-channels/FollowedChannelsPickerTab";

export type LibraryKind = "personnages" | "logos" | "inspirations";

export type LibraryPick = { imageUrl: string; label: string };

export type PickerTab = {
  id: string;
  label: string;
  render: (props: { query: string; onPick: (item: LibraryPick) => void }) => React.ReactNode;
};

/** Tabs of LibraryPickerDialog per library kind. Chantier D appends « Chaînes suivies » to `inspirations`. */
export const PICKER_TABS: Record<LibraryKind, PickerTab[]> = {
  personnages: [
    {
      id: "personnages",
      label: "Personnages",
      render: ({ query, onPick }) => <PersonaPickerGrid query={query} onPick={onPick} />,
    },
  ],
  logos: [
    {
      id: "mes-logos",
      label: "Mes logos",
      render: ({ query, onPick }) => <LogoPickerGrid query={query} onPick={onPick} />,
    },
    {
      id: "chercher-en-ligne",
      label: "Chercher en ligne",
      render: ({ query, onPick }) => <LogoSearchPicker query={query} onPick={onPick} />,
    },
  ],
  inspirations: [
    {
      id: "mes-images",
      label: "Mes images",
      render: ({ query, onPick }) => <SwipePickerGrid query={query} onPick={onPick} />,
    },
    {
      id: "chaines-suivies",
      label: "Chaînes suivies",
      render: ({ query, onPick }) => <FollowedChannelsPickerTab query={query} onPick={onPick} />,
    },
  ],
};
