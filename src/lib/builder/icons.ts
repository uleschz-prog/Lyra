// Íconos de lucide-react permitidos en los proyectos generados (verificados contra la versión instalada).
export const allowedIcons = [
  "ArrowRight", "ArrowUpRight", "Check", "CheckCircle2", "CircleCheck", "ChevronDown", "ChevronRight", "Star", "Sparkles", "Zap",
  "Shield", "ShieldCheck", "Heart", "Clock", "Calendar", "CalendarDays", "CalendarCheck", "MapPin", "Phone", "Mail",
  "MessageCircle", "Send", "Users", "User", "UserPlus", "Award", "Trophy", "Target", "TrendingUp", "BarChart3",
  "PieChart", "LineChart", "Layers", "LayoutDashboard", "Rocket", "Leaf", "Sun", "Moon", "Coffee", "Utensils",
  "UtensilsCrossed", "ChefHat", "Dumbbell", "Stethoscope", "Smile", "Scissors", "Camera", "Home", "Building2", "Briefcase",
  "Scale", "Calculator", "Truck", "Package", "ShoppingBag", "ShoppingCart", "CreditCard", "Wallet", "Gift", "Globe",
  "Lock", "Key", "Settings", "Search", "Filter", "Plus", "Minus", "Pencil", "Trash2", "X",
  "Menu", "Bell", "Bookmark", "BookOpen", "GraduationCap", "Lightbulb", "Music", "Play", "Quote", "Wifi",
  "Car", "Plane", "Palette", "PenTool", "Code2", "Cpu", "Headphones", "Flame", "Droplet", "Flower2",
  "Sprout", "PawPrint", "Baby", "Gem", "Crown", "Hammer", "Wrench", "HandHeart", "Handshake", "Megaphone",
  "FileText", "ClipboardList", "ListChecks", "KanbanSquare", "Inbox", "Archive", "Eye", "Download", "Upload", "RefreshCw",
  "LogOut", "Store", "Tag", "Percent", "Receipt", "Timer", "Activity", "HeartPulse", "Pill", "Syringe",
  "Bed", "Mountain", "Waves", "Tent", "Map", "Compass", "Ticket", "Mic", "PartyPopper", "Cake",
  "IceCream", "Pizza", "Sandwich", "Wine", "Beer", "Brush", "Shirt", "Watch", "Glasses",
] as const;

export type IconName = (typeof allowedIcons)[number];

const iconSet = new Set<string>(allowedIcons);

export function isAllowedIcon(name: unknown): name is IconName {
  return typeof name === "string" && iconSet.has(name);
}

export function iconOr(name: unknown, fallback: IconName): IconName {
  return isAllowedIcon(name) ? name : fallback;
}
