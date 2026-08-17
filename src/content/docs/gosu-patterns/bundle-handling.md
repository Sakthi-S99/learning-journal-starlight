---
title: Bundle Handling
description: Bundles are Guidewire's unit of transaction scope. Getting this wrong causes data corruption, lock contention, or silent failures.
---

> Bundles are Guidewire's unit of transaction scope. Getting this wrong causes data corruption, lock contention, or silent failures.

---

## What Is a Bundle?

A bundle is an in-memory transaction context. Every entity write (create, update, delete) must happen inside a bundle. When you commit a bundle, all changes go to the database atomically.

```
Bundle
 └── Entity A (modified)
 └── Entity B (new)
 └── Entity C (deleted)
      │
      ▼  commit()
 Database (all or nothing)
```

---

## Pattern 1 — Use the Existing Bundle (Most Common)

In BillingCenter, most Gosu code runs inside an already-active bundle — rule handlers, plugin methods, workflow steps. **Don't create a new bundle unless you must.**

```gosu
// Business Purpose: Update charge description inside an existing rule context
// The bundle is already active — just modify the entity
override function execute(charge : Charge) : void {
  charge.Description = "Adjusted: ${charge.Description}"
  // No bundle.commit() needed — caller handles commit
}
```

**How to check if a bundle is already active:**

```gosu
if (Bundle.getCurrent() != null) {
  // bundle already in scope — use it
} else {
  // need to create one
}
```

---

## Pattern 2 — Create a Bundle Explicitly (Batch / Background Jobs)

Use when running outside a request context — batch jobs, escalation workflows, scheduled tasks.

```gosu
// Business Purpose: Update delinquency status in a background batch job
// Reason For Change: No active bundle in batch context
Transaction.runWithNewBundle(\ bundle -> {
  var account = bundle.loadBean(Account, accountId) as Account
  account.DelinquencyStatus = DelinquencyStatus.TC_INDELINQUENCY
  // bundle auto-commits when the closure exits cleanly
})
```

---

## Pattern 3 — Load Entities Into the Current Bundle

When you have an entity ID and need to modify it, always load it into the active bundle first.

```gosu
// Business Purpose: Fetch and modify an invoice within the active bundle
// Edge Case: Loading without a bundle gives a read-only entity — writes will fail silently
var bundle = Bundle.getCurrent()
var invoice = bundle.loadBean(Invoice, invoiceId) as Invoice
invoice.Status = InvoiceStatus.TC_BILLED
```

---

## Pattern 4 — Never Nest Bundles

Nested bundles cause lock contention and unpredictable commit order.

```diff lang="gosu"
- // nested bundle creation
- Transaction.runWithNewBundle(\ outerBundle -> {
-   Transaction.runWithNewBundle(\ innerBundle -> {  // ← never do this
-     // ...
-   })
- })
+ // pass the outer bundle down
+ Transaction.runWithNewBundle(\ bundle -> {
+   processAccount(bundle, account)
+   processCharges(bundle, charges)
+ })
+
+ function processAccount(bundle : Bundle, account : Account) : void {
+   var loaded = bundle.loadBean(Account, account.ID) as Account
+   // modify loaded
+ }
```

---

## Pattern 5 — Read-Only Queries (No Bundle Needed)

For reads only, skip the bundle entirely. Queries outside a bundle return read-only snapshots — safe and efficient.

```gosu
// Business Purpose: Report query — read-only, no modification
var overdueInvoices = gw.api.database.Query.make(Invoice)
    .compare("Status", Relop.Equals, InvoiceStatus.TC_DUE)
    .compare("DueDate", Relop.LessThan, Date.Today)
    .select()

overdueInvoices.each(\ inv -> {
  Logger.info("Overdue: ${inv.InvoiceNumber} — ${inv.Amount}")
})
```

---

## Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Writing to entity outside bundle | Silent no-op or exception | Load entity into bundle first |
| Creating bundle inside plugin method | Double-commit, lock contention | Use existing bundle from context |
| Forgetting `bundle.loadBean()` | Stale / detached entity | Always reload into active bundle |
| Nesting bundles | Lock deadlock | Single bundle per transaction |
| Committing mid-transaction | Partial state in DB | Let the framework commit |

---

## Bundle Lifecycle in BC Context

```
HTTP Request / Job Trigger
        │
        ▼
Framework opens Bundle
        │
        ▼
Your Gosu code runs (plugin / rule / workflow)
        │
   ┌────▼─────┐
   │ Modify   │  ← your code lives here
   │ Entities │
   └────┬─────┘
        │
        ▼
Framework commits Bundle
        │
        ▼
Database updated atomically
```

**Your code should never call `bundle.commit()` manually** unless you explicitly own the bundle (batch jobs only).
