---
title: Query Patterns
description: GORM is Guidewire's ORM. Inefficient queries are the most common source of performance issues in BillingCenter.
---

> GORM is Guidewire's ORM. Inefficient queries are the most common source of performance issues in BillingCenter — especially in billing jobs processing thousands of policies.

---

## GORM Basics

All data access goes through `gw.api.database.Query`. No raw SQL, ever.

```gosu
// Basic structure
var results = gw.api.database.Query.make(EntityType)
    .compare("FieldName", Relop.Equals, value)
    .select()
```

---

## Pattern 1 — Exact Match Query

```gosu
// Business Purpose: Find a specific account by account number
var account = gw.api.database.Query.make(Account)
    .compare("AccountNumber", Relop.Equals, accountNumber)
    .select()
    .FirstResult
```

Use `.FirstResult` when you expect zero or one result — avoids exceptions on empty result sets.

---

## Pattern 2 — Multiple Conditions

```gosu
// Business Purpose: Find due invoices for an account within a date range
// Edge Case: DueDate can be null for draft invoices — always check status first
var dueInvoices = gw.api.database.Query.make(Invoice)
    .compare("PolicyPeriod.Account", Relop.Equals, account)
    .compare("Status", Relop.Equals, InvoiceStatus.TC_DUE)
    .compare("DueDate", Relop.LessThanOrEquals, Date.Today)
    .select()
```

---

## Pattern 3 — Sorting Results

```gosu
// Business Purpose: Get invoices in due date order for payment allocation
var sortedInvoices = gw.api.database.Query.make(Invoice)
    .compare("Account", Relop.Equals, account)
    .compare("Status", Relop.Equals, InvoiceStatus.TC_DUE)
    .orderBy("DueDate", true)   // true = ascending
    .select()
```

---

## Pattern 4 — Subquery / Join Traversal

Traverse relationships directly in the query — avoids loading parent entities unnecessarily.

```gosu
// Business Purpose: Find all charges for policies belonging to an account
// Avoid: loading all PolicyPeriods then iterating — causes N+1
var charges = gw.api.database.Query.make(Charge)
    .subselect("PolicyPeriod", CompareIn, PolicyPeriod, "ID")
        .compare("Account", Relop.Equals, account)
    .endSubselect()
    .select()
```

---

## Pattern 5 — Existence Check (Don't Count When You Only Need Exists)

```diff lang="gosu"
- // loads all records just to check count
- var count = gw.api.database.Query.make(Invoice)
-     .compare("Account", Relop.Equals, account)
-     .select()
-     .Count   // loads entire result set
+ // stops at first match
+ var hasInvoices = gw.api.database.Query.make(Invoice)
+     .compare("Account", Relop.Equals, account)
+     .select()
+     .FirstResult != null
```

---

## Pattern 6 — Batch Processing (Avoid Loading All Into Memory)

Never load thousands of entities into a list. Process with a cursor.

```diff lang="gosu"
- // loads all into memory at once
- var allAccounts = gw.api.database.Query.make(Account)
-     .select()
-     .toList()   // dangerous at scale
+ // streams results
+ var accountQuery = gw.api.database.Query.make(Account)
+     .compare("Retired", Relop.Equals, false)
+     .select()
+
+ accountQuery.each(\ account -> {
+   // process one at a time — memory safe
+   processAccount(account)
+ })
```

---

## Pattern 7 — Typelist (Enum) Comparisons

Always use typelist constants, never raw strings.

```diff lang="gosu"
- // brittle, breaks on typelist rename
- .compare("Status", Relop.Equals, "due")
+ // type-safe typelist reference
+ .compare("Status", Relop.Equals, InvoiceStatus.TC_DUE)
```

---

## Pattern 8 — Null-Safe Field Access After Query

```gosu
var payment = gw.api.database.Query.make(Payment)
    .compare("ReferenceNumber", Relop.Equals, refNumber)
    .select()
    .FirstResult

// Always null-check before accessing fields
if (payment != null) {
  Logger.info("Payment found: ${payment.Amount}")
} else {
  Logger.warn("No payment found for ref: ${refNumber}")
}
```

---

## N+1 Query — The Most Common BC Performance Bug

**The problem:** Querying inside a loop triggers one DB call per iteration.

```diff lang="gosu"
- // N+1: one query per policy period
- account.PolicyPeriods.each(\ pp -> {
-   var charges = gw.api.database.Query.make(Charge)
-       .compare("PolicyPeriod", Relop.Equals, pp)
-       .select()
-   // processes charges...
- })
+ // single query, all charges at once
+ var allCharges = gw.api.database.Query.make(Charge)
+     .subselect("PolicyPeriod", CompareIn, PolicyPeriod, "ID")
+         .compare("Account", Relop.Equals, account)
+     .endSubselect()
+     .select()
+
+ // Group in memory if needed
+ var chargesByPP = allCharges.partition(\ c -> c.PolicyPeriod)
```

---

## Query Performance Checklist

| Check | Why |
|---|---|
| Using `.FirstResult` not `.select().first()` | Avoids full result load |
| No queries inside loops | Prevents N+1 |
| Filtering at DB level, not in Gosu | DB filter >> in-memory filter |
| Using typelist constants not strings | Type-safe + upgrade-safe |
| Streaming with `.each()` not `.toList()` | Memory-safe for large sets |
| Subselect for relationship filters | Single query vs multiple |
