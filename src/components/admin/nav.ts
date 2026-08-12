import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Newspaper,
  Wrench,
  FolderTree,
  Images,
  FileText,
  Inbox,
  Search,
  Settings,
  Users,
  Radar,
  Table2,
  SlidersHorizontal,
} from "lucide-react";
import type { Role } from "@prisma/client";

/**
 * CMS navigation model. `status` reflects the build roadmap: "live" items are
 * functional today; "soon" items are shown (so the owner sees the full scope)
 * but are not yet clickable. Each batch flips items from "soon" to "live" — the
 * UI never fabricates a feature that isn't wired up.
 *
 * `minRole` hides items a user isn't allowed to use.
 */

export type NavStatus = "live" | "soon";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  minRole?: Role;
};

export type NavGroup = { heading: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    heading: "Genel",
    items: [
      { label: "Panel", href: "/admin", icon: LayoutDashboard, status: "live" },
    ],
  },
  {
    heading: "İçerik",
    items: [
      { label: "Ürünler", href: "/admin/products", icon: Package, status: "live" },
      { label: "Blog", href: "/admin/blog", icon: Newspaper, status: "soon" },
      { label: "Hizmetler", href: "/admin/services", icon: Wrench, status: "soon" },
      { label: "Kategoriler", href: "/admin/categories", icon: FolderTree, status: "soon" },
      { label: "Sayfalar & Metinler", href: "/admin/content", icon: FileText, status: "live" },
      { label: "Medya", href: "/admin/media", icon: Images, status: "live" },
    ],
  },
  {
    heading: "RADAR",
    items: [
      { label: "RADAR", href: "/admin/radar", icon: Radar, status: "live", minRole: "ADMIN" },
      { label: "HS Eşlemeleri", href: "/admin/radar/hs", icon: Table2, status: "live", minRole: "ADMIN" },
      { label: "RADAR Ayarları", href: "/admin/radar/settings", icon: SlidersHorizontal, status: "live", minRole: "ADMIN" },
    ],
  },
  {
    heading: "İşlemler",
    items: [
      { label: "Mesajlar", href: "/admin/contacts", icon: Inbox, status: "live" },
      { label: "SEO", href: "/admin/seo", icon: Search, status: "soon", minRole: "ADMIN" },
      { label: "Ayarlar", href: "/admin/settings", icon: Settings, status: "live", minRole: "ADMIN" },
      { label: "Kullanıcılar", href: "/admin/users", icon: Users, status: "live", minRole: "SUPER_ADMIN" },
    ],
  },
];
