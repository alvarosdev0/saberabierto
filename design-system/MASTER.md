# SaberAbierto — Design System

> Generado por ui-ux-pro-max v2.10.2  
> Project: SaberAbierto (study tool, PWA, mobile-first, learning)

## Pattern

**Minimal Single Column** — Single CTA focus, large typography, lots of whitespace, no nav clutter, mobile-first.

## Style

**Flat Design Mobile (Touch-First)**  
- Keywords: flat, 2D, color blocking, geometric, touch-first, minimal, clean
- Performance: Excellent (no GPU effects)
- Accessibility: WCAG AA

## Colors

| Token | Light | Dark |
|-------|-------|------|
| Primary | `#7C3AED` | `#A78BFA` |
| On Primary | `#FFFFFF` | `#0F172A` |
| Secondary | `#8B5CF6` | `#8B5CF6` |
| Accent/CTA | `#059669` | `#34D399` |
| Background | `#FAF5FF` | `#0F172A` |
| Foreground | `#0F172A` | `#F1F5F9` |
| Surface | `#FFFFFF` | `#1E293B` |
| Muted BG | `#F7F3FD` | `#1E293B` |
| Muted Text | `#6B7280` | `#94A3B8` |
| Border | `#EFE7FC` | `#334155` |
| Destructive | `#DC2626` | `#F87171` |
| Ring | `#7C3AED` | `#A78BFA` |

## Typography

- **Headings:** Baloo 2 (400–800)
- **Body:** system-ui, -apple-system, sans-serif
- **Import:** `@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&display=swap');`

## Key Effects

- Immediate press feedback (scale 0.97, no delay)
- Color section blocking (full-width contrasting sections)
- Zero elevation/shadow
- Solid icon containers (colored squares/circles)
- Bottom tabs solid fill (no floating)
- Smooth transitions (150-300ms)

## Avoid

- Complex onboarding
- Slow performance
- Emojis as icons (use Lucide)

## Pre-Delivery Checklist

- [x] No emojis as icons (use Lucide ✓)
- [x] cursor-pointer on all clickable elements
- [x] Hover states with smooth transitions
- [x] Light mode: text contrast 4.5:1 minimum
- [x] Responsive: 375px, 768px, 1024px, 1440px
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
