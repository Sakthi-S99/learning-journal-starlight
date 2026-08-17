---
title: Plugin Patterns
description: Plugins are the primary extension mechanism in BillingCenter. Done right, they survive upgrades and compose cleanly.
---

> Plugins are the primary extension mechanism in BillingCenter. Done right, they survive upgrades and compose cleanly. Done wrong, they break silently or conflict with OOTB behavior.

---

## What Is a Plugin?

A plugin is a Gosu class that implements a Guidewire-defined Java interface. You register your implementation in `config.xml` — Guidewire calls your class at the right point in the lifecycle.

```
Guidewire Framework
      │
      │  calls at lifecycle point
      ▼
Your Plugin Class  (implements IXxxPlugin)
      │
      │  your custom logic
      ▼
Result returned to framework
```

---

## Pattern 1 — Payment Validation Plugin

Intercept payment creation before it's recorded. Use for duplicate detection, gateway validation, or business rule enforcement.

```gosu
// Business Purpose: Prevent duplicate payments from gateway retries
// Edge Case: Same ReferenceNumber can arrive multiple times from payment gateway
class ExternalPaymentPlugin implements IPaymentPlugin {

  override function validatePayment(payment : Payment) : List<String> {
    var errors = new ArrayList<String>()

    // Duplicate reference check
    var existing = gw.api.database.Query.make(Payment)
        .compare("ReferenceNumber", Relop.Equals, payment.ReferenceNumber)
        .compare("Status", Relop.Equals, PaymentStatus.TC_APPROVED)
        .select()
        .FirstResult

    if (existing != null) {
      errors.add("Duplicate payment reference: ${payment.ReferenceNumber}")
    }

    // Amount validation
    if (payment.Amount.Amount <= 0) {
      errors.add("Payment amount must be greater than zero")
    }

    return errors
  }
}
```

---

## Pattern 2 — Billing Instruction Plugin

Hook into instruction processing when BC receives a policy event from PC.

```gosu
// Business Purpose: Custom validation before billing instruction creates charges
// Edge Case: Mid-term endorsements send amendment instructions — different from new business
class CustomBillingInstructionPlugin implements IBillingInstructionPlugin {

  override function beforeCreateBillingInstruction(
      instruction : BillingInstruction) : void {

    var account = instruction.PolicyPeriod.Account

    // Reason For Change: IDFB requirement — block bind if prior balance exceeds threshold
    if (account.TotalOutstandingDue?.Amount > 500) {
      throw new BillingException(
        "Account ${account.AccountNumber} has outstanding balance — contact billing team"
      )
    }
  }

  override function afterCreateBillingInstruction(
      instruction : BillingInstruction) : void {
    // Post-creation hook — e.g. notify external GL system
    Logger.info("BillingInstruction created for policy: ${instruction.PolicyPeriod.PolicyNumber}")
  }
}
```

---

## Pattern 3 — Delinquency Plugin

Customize when delinquency triggers and what actions are taken.

```gosu
// Business Purpose: Custom delinquency trigger — skip delinquency for VIP accounts
// Edge Case: Account may have a grace period extension set by customer service
class CustomDelinquencyPlugin implements IDelinquencyPlugin {

  override function shouldInitiateDelinquency(account : Account) : boolean {
    // Skip VIP accounts — handled manually
    if (account.VIPFlag) {
      Logger.info("Skipping delinquency for VIP account: ${account.AccountNumber}")
      return false
    }

    // Respect grace period extensions
    if (account.GracePeriodExtension != null
        && account.GracePeriodExtension.AfterDate(Date.Today)) {
      return false
    }

    return true
  }
}
```

---

## Pattern 4 — Payment Allocation Plugin

Control how incoming payments are applied across invoices and charges.

```gosu
// Business Purpose: Apply payments to oldest due invoices first (FIFO)
// Edge Case: Partial payment — don't leave tiny residual amounts on invoices
class FIFOPaymentAllocationPlugin implements IPaymentAllocationPlugin {

  override function allocatePayment(
      payment   : Payment,
      invoices  : List<Invoice>) : List<PaymentAllocation> {

    var allocations = new ArrayList<PaymentAllocation>()
    var remaining = payment.Amount.Amount

    // Sort oldest due date first
    var sorted = invoices.sortBy(\ i -> i.DueDate)

    for (invoice in sorted) {
      if (remaining <= 0) break

      var allocAmt = Math.min(remaining, invoice.AmountDue.Amount)
      allocations.add(buildAllocation(payment, invoice, allocAmt))
      remaining -= allocAmt
    }

    return allocations
  }
}
```

---

## Plugin Registration

All plugins are registered in `config/plugin-config.xml`:

```xml
<plugin-config>
  <!-- Payment -->
  <plugin interface="gw.plugin.billing.IPaymentPlugin"
          class="gw.bc.plugin.ExternalPaymentPlugin"/>

  <!-- Billing Instruction -->
  <plugin interface="gw.plugin.billing.IBillingInstructionPlugin"
          class="gw.bc.plugin.CustomBillingInstructionPlugin"/>

  <!-- Delinquency -->
  <plugin interface="gw.plugin.billing.IDelinquencyPlugin"
          class="gw.bc.plugin.CustomDelinquencyPlugin"/>

  <!-- Payment Allocation -->
  <plugin interface="gw.plugin.billing.IPaymentAllocationPlugin"
          class="gw.bc.plugin.FIFOPaymentAllocationPlugin"/>
</plugin-config>
```

---

## Key BC Plugin Interfaces

| Interface | Lifecycle Point | Common Use |
|---|---|---|
| `IPaymentPlugin` | Before/after payment creation | Validation, duplicate check |
| `IBillingInstructionPlugin` | Before/after instruction processing | Pre-bind validation |
| `IDelinquencyPlugin` | Delinquency trigger evaluation | Custom trigger rules |
| `ICommissionPlugin` | Commission calculation | Custom producer rates |
| `IPaymentAllocationPlugin` | Payment application logic | FIFO, custom priority |
| `IInvoicePlugin` | Invoice generation hooks | Custom invoice content |
| `IMessageTransport` | Outbound messaging | External system notifications |

---

## Plugin Rules

- **Never create a new bundle inside a plugin method** — the framework provides one
- **Return errors as a list, don't throw** — for validation plugins (`validateXxx` methods)
- **Throw for hard stops** — use `BillingException` to block the operation
- **Log at entry/exit for complex plugins** — aids production debugging
- **Single responsibility** — one plugin per concern, not one plugin for everything
