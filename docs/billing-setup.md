# Deferred billing setup

This is an unfinished draft preserved for a later release. Do not deploy it as a paid product yet. Dodo is unconfigured; live payment lifecycle verification and manual UI verification remain outstanding. Account and product setup are manual.

## Dodo Payments

1. Create an account with your actual legal name and India as your country. Use Cascadehook as the product brand; do not invent a company name. Complete Dodo's identity and business verification. Before live approval, review the public policies and add the operator identity and contact details Dodo requires.
2. Publish `/pricing`, `/support`, `/terms`, `/privacy`, and `/refunds`. The refund policy offers a full refund within seven days of the first paid purchase, for monthly and annual subscriptions. Refunds are reviewed manually in Dodo; renewals do not restart the window.
3. In **test mode**, create four fixed-price recurring products:

| Product | USD price | Recurs every | Environment variable |
| --- | ---: | --- | --- |
| Cascadehook Starter Monthly | $9 | 1 month | `DODO_STARTER_MONTHLY_PRODUCT_ID` |
| Cascadehook Starter Annual | $90 | 1 year | `DODO_STARTER_ANNUAL_PRODUCT_ID` |
| Cascadehook Growth Monthly | $29 | 1 month | `DODO_GROWTH_MONTHLY_PRODUCT_ID` |
| Cascadehook Growth Annual | $290 | 1 year | `DODO_GROWTH_ANNUAL_PRODUCT_ID` |

Use quantity 1, no trial, no metered usage, no add-ons, and no discounts or adaptive/local currency prices. Amounts are before applicable taxes. Free has no Dodo product. The server checks the exact product, recurring price, currency, interval, and successful payment before activation.

4. Add a webhook endpoint at `https://api.cascadehook.com/v1/webhooks/dodo`. Subscribe to all `subscription.*` lifecycle events, `refund.succeeded`, and `dispute.lost`. Copy the endpoint's `whsec_…` signing secret.
5. Configure API service variables (never frontend/public variables):

```dotenv
DODO_PAYMENTS_API_KEY=<test API key>
DODO_PAYMENTS_WEBHOOK_KEY=<webhook signing secret>
DODO_PAYMENTS_ENVIRONMENT=test_mode
BILLING_APP_URL=https://cascadehook.com
DODO_STARTER_MONTHLY_PRODUCT_ID=<pdt_…>
DODO_STARTER_ANNUAL_PRODUCT_ID=<pdt_…>
DODO_GROWTH_MONTHLY_PRODUCT_ID=<pdt_…>
DODO_GROWTH_ANNUAL_PRODUCT_ID=<pdt_…>
```

Apply migration `00023` before deploying the API and janitor. On the VM these variables go in `deploy/.env`; Compose passes billing keys only to the API. Use the root `.env` for local operator commands. The worker does not need payment credentials.

6. Manually verify the test-mode flow: owner checkout, successful/failed payment, duplicate webhook, renewal, cancellation, scheduled plan/interval change, refund, and portal access. Admins can read billing; only owners can change it. Closing checkout cannot unlock access. Check Dodo delivery logs when a payment is complete but a plan is pending.
7. After verification, create the same four products in **live mode** and replace all keys, product IDs, webhook secret, and environment together. Test and live identifiers are separate. Never change an existing product's price in place: founding subscribers keep their original rate for 12 continuous months. A future price change needs a versioned catalog and migration policy first.

Subscriptions belong to an organization. New organizations use Free. Existing organizations retain their allowances until choosing a paid plan. Each accepted endpoint delivery counts once, failed deliveries count, automatic retries do not add usage, and a manual replay counts again. Monthly limits reset at 00:00 UTC on the first calendar day, including annual subscriptions. Changing plans preserves usage already consumed.

Plan changes take effect at the next renewal. Cancel through the hosted portal to stop renewal. A missing renewal can retain paid allowances for up to 72 hours after the recorded paid-through date while payment is retried; cancellation has no grace extension. After expiry, admission uses Free limits without needing another webhook. Existing resources remain, with creation/publication limited by the lower quotas. History follows plan retention. Keep the janitor scheduled.

A full refund or lost dispute cancels the affected subscription and revokes its paid access. Partial refunds do not change entitlements. The app does not issue refunds itself. Refund requests are reviewed in the Dodo dashboard.

## Recovery

Run with operator database access, never a customer token:

```sh
bun run ops:billing status --organization <UUID>
bun run ops:billing reconcile --organization <UUID> --subscription <sub_…>
```

Reconciliation retrieves Dodo's current subscription and payment state; it does not create a product, customer, checkout, or charge. Use it after correcting a delayed/misconfigured webhook. Preserve checkout operation metadata and original product IDs when troubleshooting.

An ambiguous checkout error keeps its reservation to prevent a second purchase. A persisted link can be resumed. If no link was persisted, inspect Dodo using the operation metadata `cascadehook_checkout` and `cascadehook_organization`; API logs also record the session ID if persistence failed. If payment succeeded, reconcile that subscription. **Only clear a reservation after Dodo confirms the checkout cannot complete and there is no successful payment/subscription.** A local timeout or closed browser is not evidence of expiry.

```sh
bun run ops:billing clear-checkout --organization <UUID> \
  --expected-checkout <checkout UUID from status> \
  --operator <your-label> --provider-reference <evidence-reference> \
  --confirmed-no-purchase
```

This command records an audit row and checks the exact reservation under a lock. Never use it to bypass an active purchase. Billing event failures are logged without payment URLs, credentials, or raw payment payloads.

Sources: [Dodo subscriptions](https://docs.dodopayments.com/developer-resources/subscription-integration-guide), [webhooks](https://docs.dodopayments.com/developer-resources/webhooks), [verification](https://docs.dodopayments.com/miscellaneous/verification-process), [Resend Inboxes](https://resend.com/docs/dashboard/inboxes/introduction), [receiving DNS](https://resend.com/docs/dashboard/receiving/custom-domains).
