---
title: Gosu Patterns
description: Reusable patterns extracted from real BillingCenter development work.
---

> Reusable patterns extracted from real BillingCenter development work — covering bundle handling, query efficiency, plugin structure, and common pitfalls.

---

## Why This Exists

The same problems appear repeatedly across BillingCenter projects. This section captures proven solutions so they don't have to be rediscovered.

---

## Pattern Index

| Pattern | Risk If Wrong | Page |
|---|---|---|
| [Bundle Handling](/gosu-patterns/bundle-handling/) | Data corruption, lock contention | High |
| [Query Patterns](/gosu-patterns/query-patterns/) | N+1 queries, performance degradation | High |
| [Common Pitfalls](/gosu-patterns/common-pitfalls/) | Silent failures, upgrade breaks | High |
| [Plugin Patterns](/gosu-patterns/plugin-patterns/) | Incorrect extension behavior | Medium |

---

## Gosu Quick Reference

**Language basics that matter in BC context:**

```gosu
// Null safety
var name = contact?.Name ?: "Unknown"

// Type check + cast
if (charge typeis InvoiceItem) {
  var item = charge as InvoiceItem
}

// Safe iteration
policyPeriod.Charges?.each(\ c -> {
  // process charge
})

// String interpolation
var msg = "Policy ${policy.PolicyNumber} has ${charges.Count} charges"
```

---

## Core Rules (Never Break These)

1. **Always be bundle-aware** — every entity write needs a bundle in scope
2. **Never raw SQL** — all data access through GORM entities
3. **No business logic in PCF** — delegates to Gosu only
4. **Upgrade safety** — extend via plugins and `gsrc/`, never touch core
5. **OOTB first** — check if BC already does it before writing custom logic
