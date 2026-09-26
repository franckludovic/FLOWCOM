# FlowCom product and design brief

Status: agreed direction, 2026-09-26. Guides the redesign and the code
foundations that make FlowCom a modular, white-label product.

## Goal

FlowCom is one calm, AI-native workspace where every screen answers "what
should I do next, and why?", backed by the company's own data. It is sold to
clients as a complete package or as modules, each client with its own
installation and its own look.

The redesign must:

1. **Modernise the UI without looking generic**: current, clean, with a few
   recognisable FlowCom signatures (how AI insights, evidence and approvals
   appear) instead of a stock dashboard template.
2. **Make the UX much better**: each page is organised around the person's
   job and their next decision, with one clear primary action.
3. **Centralise every design choice**: colours, typography, logo, corner
   style, shadows, spacing and density come from one theme. Only page
   structure is fixed.
4. **Be light and dark, and always readable**: every text and control meets
   WCAG AA contrast in both modes, whatever the client's brand.
5. **Be responsive**: phone, tablet, desktop and wide screens.
6. **Be modular**: modules can be sold separately, yet work together in one
   workspace, and the AI reaches across every enabled module.

## Installations, companies and modules

- **One installation per client**: a separate Power Platform environment with
  the FlowCom solution imported. An installation can still hold several
  companies (for example a group with subsidiaries).
- **Installation settings** (one Dataverse record per installation): the
  theme and the enabled modules. Edited in Paramètres by an administrator; no
  rebuild needed.
- **One workspace**: a single sidebar and a single dashboard, assembled from
  the enabled modules. There is no switching between "owner" and "marketer"
  versions.

### Modules

| Module | Contents | Sidebar section |
|---|---|---|
| **Core** (always on) | Companies, memory, users and roles, contacts and timeline, integrations, theme, AI engine | Entreprise |
| **Marketing Studio** | Content Generator, Library, Calendar, Studio, Publishing history | Marketing |
| **Campaigns & Targeting** | Campaigns, zones, results, AI brief and analysis | Marketing |
| **Pilotage** | Cockpit widgets, weekly digest, reports, approvals inbox, goals | Pilotage |
| **CRM Insights** (Odoo) | Pipeline, opportunities, follow-ups | Clients |
| **WhatsApp Conversations** | Inbox, analytics, AI replies | Clients |
| **AI Assistant** | Cross-module chat assistant | Top bar |

### How modules compose

A **module registry** in code is the single source for what a module brings:

- its pages and routes,
- its sidebar entries and their section (Pilotage, Marketing, Clients, Entreprise),
- its dashboard widgets,
- its assistant tools,
- the integrations it needs.

The sidebar, the router, the dashboard and the assistant all read the
registry filtered by the enabled modules (and, optionally, by role). A
disabled module's pages, widgets and tools disappear; an empty sidebar
section disappears. All modules write to the shared core (contacts, timeline,
AI insights and actions), which is what lets the AI combine sources.

Typical setups:

| Setup | Sections | Dashboard |
|---|---|---|
| Complete package | Pilotage, Marketing, Clients, Entreprise | Decision KPIs and marketing to-dos side by side |
| Direction | Pilotage, Clients, Entreprise | Results, digest, approvals, pipeline |
| Marketing | Marketing, Entreprise | Today's content, this week's calendar, active campaigns |

Roles can narrow what a person sees inside an installation; by default
everyone sees everything the installation has.

## Theme

Every visual decision is a token. Pages and components use tokens only,
never raw colours, sizes or fonts.

1. **Brand tokens** (set per installation): primary colour, accent colour,
   logo (light and dark versions), heading and body fonts, corner style
   (sharp, soft, round), shadow style, density (compact, comfortable).
2. **Semantic tokens** (derived automatically, for light and dark): page and
   card surfaces, text and muted text, borders, primary button and its
   hover, pressed and disabled states, soft primary backgrounds, focus ring,
   and the AI accent. Derived colours are **contrast-checked and corrected**:
   text reaches 4.5:1 and controls 3:1 against their background.
3. **Fixed tokens** (never branded):
   - status colours (success, warning, error, info), so meaning stays constant;
   - the chart palette (validated colour-blind-safe order, with its own dark
     steps), so data stays readable whatever the brand;
   - the spacing scale (4 px steps), type scale and breakpoints, so layouts
     stay balanced.

Light and dark are both designed, not inverted: each has its own surfaces
and its own derived brand steps. The user's choice (light, dark, system) is
remembered per device.

## UX principles

- **One job, one primary action per page**, visible without scrolling.
- **Next step first**: pages open on what needs attention (drafts to finish,
  approvals waiting, campaigns behind target), then the detail.
- **AI in context**: each page can show the AI's suggestion for that page and
  offers "ask the assistant about this". AI output always carries its
  evidence and, when it changes something, an Approve / Reject card.
- **Actions look like actions**: buttons, chips or cards, never plain links.
- **Progressive disclosure**: advanced settings stay folded until needed.
- **French first**: layouts allow for longer labels; both languages supported.
- **Forgiving**: confirm destructive actions, keep drafts, explain errors in
  plain words with a way forward.

## Responsive behaviour

| Width | Layout |
|---|---|
| < 640 px (phone) | Sidebar as a drawer, single column, bottom-anchored primary action where useful, assistant full screen |
| 640–1024 px (tablet) | Collapsible sidebar (icons), one or two columns |
| ≥ 1024 px (desktop) | Full sidebar, multi-column pages, assistant as a side panel |
| ≥ 1440 px (wide) | Content width capped for readability; dashboards use extra columns |

## Success criteria

- From the dashboard, "publish a post for my active campaign" takes 3 clicks or fewer.
- On every page the primary action is visible without scrolling on desktop and phone.
- Every screen uses only theme tokens and shared components.
- Switching the theme (brand colour, fonts, corner style, light/dark) changes
  every page correctly, and every text passes WCAG AA contrast.
- A module can be disabled with no broken links, empty sections or dead tools.

## Plan

1. **This brief.**
2. **Design system** on the design canvas: tokens, theming rules and every
   shared component, shown in light and dark and in 2–3 example client
   brands.
3. **Code foundations**: theme engine (tokens, derivation, contrast
   correction, installation settings), module registry, the one-workspace
   shell (sidebar sections, dashboard widgets), enabled modules.
4. **Pages, one module at a time**, starting with **Marketing Studio**
   (already built, so the work is purely UI and UX): each page designed on
   the canvas, reviewed, then implemented.
