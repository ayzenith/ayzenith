import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Package,
  ShoppingCart,
  Truck,
  Boxes,
  Store,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Landmark,
  BarChart3,
  Settings,
} from "lucide-react";

/**
 * Business OS navigation.
 *
 * Nine entries in the main rail and nothing else. The owner's own rule for this
 * product was "çok özellik ≠ karmaşık arayüz": depth belongs on the detail
 * screens, not in a sidebar of thirty links. Everything secondary (konumlar,
 * tekrarlayan giderler, kanal fiyatları, stok hareketleri, içe aktarma) is
 * reached from the screen it belongs to.
 */

export type OsNavItem = { label: string; href: string; icon: LucideIcon; hint?: string };
export type OsNavGroup = { heading: string; items: OsNavItem[] };

export const osNavGroups: OsNavGroup[] = [
  {
    heading: "Genel",
    items: [{ label: "Kokpit", href: "/os", icon: LayoutDashboard }],
  },
  {
    heading: "Ticaret",
    items: [
      { label: "Firmalar", href: "/os/companies", icon: Building2, hint: "Müşteri, tedarikçi, bayi — tek kayıt" },
      { label: "Ürünler", href: "/os/products", icon: Package, hint: "Fiyat, maliyet, marj" },
      { label: "Satışlar", href: "/os/sales", icon: ShoppingCart },
      { label: "Alışlar", href: "/os/purchases", icon: Truck },
      { label: "Stok", href: "/os/inventory", icon: Boxes, hint: "Konum bazlı stok defteri" },
      { label: "Kanallar", href: "/os/channels", icon: Store },
    ],
  },
  {
    heading: "Finans",
    items: [
      { label: "Finans", href: "/os/finance", icon: Wallet, hint: "Nakit akışı takvimi" },
      { label: "Tahsilatlar", href: "/os/payments?direction=IN", icon: ArrowDownLeft },
      { label: "Ödemeler", href: "/os/payments?direction=OUT", icon: ArrowUpRight },
      { label: "Giderler", href: "/os/expenses", icon: Receipt },
      { label: "Vergi Takvimi", href: "/os/tax", icon: Landmark },
    ],
  },
  {
    heading: "Analiz",
    items: [
      { label: "Raporlar", href: "/os/reports", icon: BarChart3 },
      { label: "Ayarlar", href: "/os/settings", icon: Settings },
    ],
  },
];

/** The global "+" menu. One place to start anything. */
export const quickActions: Array<{ label: string; href: string }> = [
  { label: "Firma", href: "/os/companies/new" },
  { label: "Ürün", href: "/os/products/new" },
  { label: "Satış", href: "/os/sales/new" },
  { label: "Alış", href: "/os/purchases/new" },
  { label: "Gider", href: "/os/expenses?new=1" },
  { label: "Tahsilat planı", href: "/os/payments?new=IN" },
  { label: "Ödeme planı", href: "/os/payments?new=OUT" },
];
