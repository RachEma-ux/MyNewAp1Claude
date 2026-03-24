# Module Section Landing Page — Implementation Checklist

## Template

Copy this checklist for each section landing page in your module.

---

## Section: [SECTION_LABEL]

- **Section ID:** [section-id]
- **Route:** [/module/section-id]
- **Module:** [MODULE_NAME]

### Prerequisites

- [ ] Section is defined in the canonical nav config
- [ ] Section has at least one live child item
- [ ] Section's `requiredAction` is defined in the module's action constants
- [ ] Section route is mounted in `App.tsx`

### Landing Page Requirements

- [ ] Page component created (e.g., `ModuleSectionLandingPage.tsx`)
- [ ] Page receives the section ID as a parameter (or from route)
- [ ] Page reads items from the canonical nav config
- [ ] Page filters items by user permissions (uses auth helper)
- [ ] Live items displayed as clickable cards/links
- [ ] Not-yet-implemented items displayed as "Coming soon" cards
- [ ] Items the user cannot access are hidden (respects `visibilityMode`)
- [ ] Page displays the section's `purpose` text
- [ ] Page has a breadcrumb or back link to the module home

### Visibility Behavior

- [ ] `visibilityMode: "show"` items always visible
- [ ] `visibilityMode: "hide-if-no-access"` items hidden for unauthorized users
- [ ] `visibilityMode: "show-disabled"` items visible but disabled
- [ ] Empty sections (no visible items) show appropriate message or are not rendered

### Testing

- [ ] Test that section route is mounted in App.tsx
- [ ] Test that all live child items have matching page files
- [ ] Test that visibility filtering works correctly per role
- [ ] Test that "Coming soon" items are shown for deferred capabilities

### Governance

- [ ] Section documented in module governance pack
- [ ] Section's scope and visibility match governance analysis
- [ ] Deferred items documented in MODULE_OPEN_GAPS.md
