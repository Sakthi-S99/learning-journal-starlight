---
title: Common Pitfalls
description: Mistakes that are easy to make, hard to spot in testing, and painful in production.
---

> Mistakes that are easy to make, hard to spot in testing, and painful in production.

---

## Pitfall 1 — Modifying Entities Outside a Bundle

**Symptom:** Changes appear to succeed but are never persisted. No exception thrown.

```gosu
// WRONG — entity not in a bundle, write silently ignored
var invoice = someMethod.getInvoice()
invoice.Status = InvoiceStatus.TC_BILLED  // ← lost on commit

// CORRECT — load into active bundle first
var bundle = Bundle.getCurrent()
var invoice = bundle.loadBean(Invoice, invoiceId) as Invoice
invoice.Status = InvoiceStatus.TC_BILLED
```

---

## Pitfall 2 — Raw String Comparisons on Typelists

**Symptom:** Query returns no results even when data exists. Breaks silently after typelist rename.

```gosu
// WRONG
.compare("BillingMethod", Relop.Equals, "AgencyBill")

// CORRECT
.compare("BillingMethod", Relop.Equals, BillingMethod.TC_AGENCYBILL)
```

---

## Pitfall 3 — Null Pointer on Relationship Traversal

**Symptom:** `NullPointerException` in production on paths that work in dev (data setup differences).

```gosu
// WRONG — assumes PolicyPeriod and Account are always set
var accountNumber = charge.PolicyPeriod.Account.AccountNumber

// CORRECT — null-safe traversal
var accountNumber = charge.PolicyPeriod?.Account?.AccountNumber ?: "UNKNOWN"
```

---

## Pitfall 4 — Business Logic in PCF

**Symptom:** Logic works in UI but not via API. Duplicate logic when building integrations.

```gosu
// WRONG — calculation inside a PCF widget
widget.Value = invoice.Amount * 0.1   // ← never put logic here

// CORRECT — PCF calls a Gosu method
widget.Value = InvoiceHelper.calculateLateFee(invoice)
```

Rule: PCF is for display only. All logic lives in Gosu classes or rules.

---

## Pitfall 5 — Ignoring Upgrade Safety

**Symptom:** Version upgrade overwrites custom changes. Hours of rework post-upgrade.

```
// WRONG — modifying OOTB Guidewire class directly
// gw/bc/domain/Invoice.gs  ← core file, gets overwritten on upgrade

// CORRECT — create an enhancement or subclass in gsrc/
// gsrc/gw/bc/extensions/InvoiceEnhancement.gsx
enhancement InvoiceEnhancement : Invoice {
  function calculateLateFee() : MonetaryAmount {
    // custom logic here — survives upgrades
  }
}
```

---

## Pitfall 6 — Creating Bundles Inside Plugin Methods

**Symptom:** Lock contention, deadlocks, or duplicate commits in production under load.

```gosu
// WRONG — plugin method already has a bundle from the framework
class MyPaymentPlugin implements IPaymentPlugin {
  override function validatePayment(payment : Payment) : List<String> {
    Transaction.runWithNewBundle(\ b -> {  // ← unnecessary, causes issues
      // ...
    })
  }
}

// CORRECT — use the existing bundle
class MyPaymentPlugin implements IPaymentPlugin {
  override function validatePayment(payment : Payment) : List<String> {
    var bundle = Bundle.getCurrent()
    // work with existing bundle
  }
}
```

---

## Pitfall 7 — Loading Large Collections Into Memory

**Symptom:** `OutOfMemoryError` during billing batch jobs processing large books of business.

```gosu
// WRONG — loads all active policies into memory at once
var policies = gw.api.database.Query.make(PolicyPeriod)
    .compare("Status", Relop.Equals, PolicyPeriodStatus.TC_INFORCE)
    .select()
    .toList()   // ← kills the JVM on large datasets

// CORRECT — stream with .each()
gw.api.database.Query.make(PolicyPeriod)
    .compare("Status", Relop.Equals, PolicyPeriodStatus.TC_INFORCE)
    .select()
    .each(\ pp -> {
      processPolicyPeriod(pp)
    })
```

---

## Pitfall 8 — Swallowing Exceptions

**Symptom:** Errors disappear silently. No log. Production data in inconsistent state.

```gosu
// WRONG — exception swallowed, no trace
try {
  processPayment(payment)
} catch (e : Exception) {
  // nothing here
}

// CORRECT — always log, always rethrow or handle explicitly
try {
  processPayment(payment)
} catch (e : Exception) {
  Logger.error("Payment processing failed for ${payment.ReferenceNumber}: ${e.Message}", e)
  throw e   // or handle explicitly with fallback
}
```

---

## Pitfall 9 — Hardcoding Typelist Codes as Strings

**Symptom:** Works in one environment, fails in another where typelist extensions differ. Breaks on upgrade.

```gosu
// WRONG
if (account.BillingMethod == "AgencyBill") { ... }

// CORRECT
if (account.BillingMethod == BillingMethod.TC_AGENCYBILL) { ... }
```

---

## Pitfall 10 — Misunderstanding Invoice Stream Impact

**Symptom:** Charges appear on wrong invoices. Payment allocation behaves unexpectedly.

- Every charge must be associated with the correct **invoice stream**
- Invoice streams are determined by billing method and payment plan
- Adding a charge without setting the stream defaults to the primary stream — may be wrong for agency bill or multi-stream setups

```gosu
// Business Purpose: Ensure charge is assigned to the correct invoice stream
// Edge Case: Agency bill policies have a separate stream from direct bill
var correctStream = InvoiceStreamHelper.resolveStream(policyPeriod, chargeType)
charge.InvoiceStream = correctStream
```

---

## Pitfall Summary

| Pitfall | Detection | Severity |
|---|---|---|
| Write outside bundle | Silent data loss | Critical |
| Raw typelist strings | Query returns nothing | High |
| Null traversal | NPE in production | High |
| Logic in PCF | API bypass misses logic | High |
| Core file modification | Upgrade overwrites | High |
| Bundle inside plugin | Deadlock under load | High |
| `.toList()` on large sets | OOM in batch jobs | High |
| Swallowed exceptions | Silent failures | High |
| Hardcoded strings | Environment-specific failures | Medium |
| Wrong invoice stream | Billing errors | Medium |
