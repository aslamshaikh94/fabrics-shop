# Partners Sub-components

These sub-components were extracted from the large `Partners.jsx` (1089 lines) to enable:

1. **Lazy loading** via `next/dynamic` — recharts library is only loaded when the chart section renders
2. **Smaller initial bundle** — reduces the main component's code size from 1089 lines to ~200 lines
3. **No flickering** — the partner page header loads immediately, chart/table sections show skeleton loading states
