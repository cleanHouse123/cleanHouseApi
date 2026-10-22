# Coupons — Design Spec

**Date:** 2026-08-12
**Status:** Approved (design), pending implementation plan
**Scope:** Backend (`backend-mussor` / cleanHouseApi), Admin (`mussor-admin`), Web (`clenHouseWeb`)

## 1. Goal

Add a coupon / promo-code system that discounts the price of **subscriptions** and **orders**. Immediate pilot (one district): a shared code that makes a monthly subscription cost **1₽**, usable **once per user**. The engine is built in full now so future cases need no breaking migration:

- Percent discount.
- Fixed final price (e.g. 1₽).
- "N months for 1₽" — a subscription plan of N-month duration priced to 1₽ via a coupon (duration comes from the plan).
- "3 orders for the price of one" — a subscription plan with `ordersLimit=3` priced via a coupon (bundle = plan, coupon only changes price).

## 2. Key decisions (from requirements)

1. **Full engine now**, clean extensible model (chosen over hardcoded pilot).
2. **Order bundles are subscription plans**, not a separate coupon mechanic. A coupon only changes price; duration and `ordersLimit` live on the plan.
3. **One shared code**, redeemable **once per user** (DB-enforced) + optional **global cap** (`maxRedemptions`).
4. **Redemption surface = web (clenHouseWeb)** subscription purchase. Mobile client is out of scope for the pilot.
5. **Only one discount at a time; coupon takes priority** (replace) — when a valid coupon applies, the existing auto-discounts ("first order 1₽", referral-free subscription) are ignored entirely.
6. **District = operational only**, no geo-check in the coupon.
7. **Minimum charge under a coupon = 1₽** (100 kopecks). A coupon never makes something free; the free (0₽) path stays reserved for referral-free subscriptions only.
8. **Approach A** — dedicated `Coupon` module with `CouponService`, explicit `discountType` enum, reserve→confirm→release redemption lifecycle. (Not inline in PriceService; not a generic rule engine.)
9. **Prod schema via proper TypeORM migrations** (re-enable the migrations pipeline).

## 3. Architecture

Dedicated NestJS module `src/coupon/`:
- `Coupon` + `CouponRedemption` entities.
- `CouponService` — validation, `computeFinalAmount`, reserve / confirm / release.
- `CouponController` — admin CRUD (`JwtAuthGuard + AdminGuard`) + client `POST /coupons/validate`.
- Injected into `OrderService` and the subscription `PaymentService` at the existing server-side price-computation points.

Isolation: pricing math and lifecycle live in `CouponService`; order/subscription flows call one method and get a final amount + a reservation handle. Coupon internals can change without touching those flows.

## 4. Data model (Postgres, money in integer kopecks)

### `coupon`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | varchar, **unique**, indexed | normalized trim + UPPERCASE on save and lookup |
| `description` | varchar, nullable | admin note |
| `scope` | enum `subscription` \| `order` \| `both` | which flow it applies to |
| `discountType` | enum `percent` \| `fixed_amount` \| `final_price` | effect type |
| `value` | integer | percent 1..100; else kopecks |
| `isActive` | boolean, default true | manual on/off |
| `startsAt` / `endsAt` | timestamp, nullable | validity window (null = unbounded) |
| `maxRedemptions` | integer, nullable | global cap (null = unlimited) |
| `redeemedCount` | integer, default 0 | confirmed+reserved redemptions counter |
| `minAmount` | integer, nullable | min base price to apply (kopecks) |
| `subscriptionPlanId` | uuid FK, nullable | restrict a subscription coupon to one plan (null = any); ignored for `order` |
| `createdAt` / `updatedAt` | timestamp | |

Single `subscriptionPlanId` now (covers month / N-month / bundle — each is a distinct plan). Generalize to a plan list later via a join table if needed — non-breaking.

### `coupon_redemption`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `couponId` | uuid FK, indexed | |
| `userId` | uuid FK, indexed | |
| `status` | enum `reserved` \| `confirmed` | reserved at apply, confirmed at payment success |
| `orderId` / `subscriptionId` | uuid, nullable | what it was applied to |
| `amountBefore` / `amountAfter` | integer | audit (kopecks), frozen at reserve time |
| `createdAt` / `updatedAt` | timestamp | |
| **UNIQUE (`couponId`, `userId`)** | | DB guarantee of "once per user"; released rows are deleted so retries work |

"Once per user" is fixed at exactly one via the unique constraint (no `perUserLimit` field). A future >1-per-user limit would require switching enforcement from the unique constraint to a counted check — non-breaking to add later.

## 5. Discount computation

Pure function `computeFinalAmount(coupon, baseAmount) -> kopecks`:
- `percent`: `round(base * (100 - value) / 100)`
- `fixed_amount`: `base - value`
- `final_price`: `value`
- **Clamp always:** `final = clamp(computed, 100, base)` — min 1₽, never above base.

Since plans/orders always cost far more than 1₽, a coupon never yields a free purchase; it always charges ≥ 1₽ through YooKassa.

### Application points (server-side only)
- **Order:** `order.service.ts` `create()` (~line 146) — after the base price is computed, before order create and `createPaymentLink`.
- **Subscription:** `subscription/services/payment.service.ts` `createPaymentLink()` (~line 159 `finalAmount`) and `subscription.service.ts` `createByPlan()` (~line 174).

### Priority / "one discount" (replace)
- If a valid `couponCode` is present → base price is the **full** price (order: standard tiered price without first-order-1₽; subscription: `plan.priceInKopecks` without referral-free), then the coupon is applied.
- If no coupon → existing behavior unchanged (first-order / referral-free).

## 6. Redemption lifecycle (correctness core)

Three phases tied to payment, protecting against races and coupon oversell:

**RESERVE — at payment-link creation, in one DB transaction:**
1. Validate: active, within window, scope matches, plan matches, `base >= minAmount`.
2. Atomic global-cap capture:
   `UPDATE coupon SET redeemedCount = redeemedCount + 1 WHERE id = :id AND (maxRedemptions IS NULL OR redeemedCount < maxRedemptions)` → 0 rows ⇒ cap reached.
3. `INSERT coupon_redemption(status=reserved, amountBefore, amountAfter)` — unique `(couponId,userId)` rejects a second use by the same user at the DB level.
4. Both steps in the same transaction as the purchase; YooKassa failure after reserve → rollback/release.

**CONFIRM — on the payment-success webhook** (`order-payment.service` / subscription `updatePaymentStatus` on `PAYMENT_PAID`): set `status=confirmed`; log to existing `PaymentAudit`. **Idempotent** — a duplicate `PAYMENT_PAID` is a no-op.

**RELEASE — on payment cancel/failure/expiry:** delete the `reserved` row and `redeemedCount -= 1` atomically. Slot and the user's right are freed for a retry.
- Trigger: payment `canceled`/failure webhook **plus** a `@nestjs/schedule` cron backstop (~30 min) that releases `reserved` rows with no successful payment.

Reserve happens at link creation (not at webhook) specifically so the global cap can't be oversold under concurrency.

## 7. API surface

**Admin (`JwtAuthGuard + AdminGuard`, mirrors `subscription-plans.controller`):**
- `POST /coupons` — create
- `GET /coupons` — list (+ `redeemedCount`/`maxRedemptions`, status)
- `GET /coupons/:id` — detail
- `PATCH /coupons/:id` — update
- `DELETE /coupons/:id` — allowed only if no redemptions; otherwise respond "deactivate instead" (`isActive=false`) to avoid breaking `coupon_redemption` FKs.

**Client (`JwtAuthGuard`):**
- `POST /coupons/validate` — `{ code, scope, planId? }` → `{ valid, baseAmount, finalAmount, discountAmount, reason? }`. Preview only, **no reservation**. Web calls it to show the discounted price before payment.

**Apply — no separate endpoint:** `couponCode` is an optional field on the existing purchase requests. The server validates + reserves atomically there (§6). One step ⇒ no "applied but unpaid" race.

**DTO additions:** `CreateSubscriptionByPlanDto` and `CreateOrderDto` gain optional `couponCode`.

## 8. Frontend integration

**Web (`clenHouseWeb`)** — promo-code input on subscription purchase → `POST /coupons/validate` for preview → send `couponCode` in the create-subscription / payment-link request → display price **only from the server response** (never compute client-side).

**Admin (`mussor-admin`)** — new `coupons` module copied from `subscription-plans`: `types/api/hooks/forms/components/page` + route + route constants + nav item. Form maps to the entity; list shows status and redemption counter.

## 9. Security & edge cases

- Server always recomputes price; `couponCode` is just a string. Immutable invariant.
- Code normalization (trim + UPPERCASE) on save and lookup.
- Per-user via DB unique constraint (not just an app check) — race-safe.
- Global cap via atomic conditional UPDATE — not read-then-write.
- Clamp `[100, base]` — min 1₽, never above base.
- One discount — coupon replaces auto-discounts.
- Validity window + `isActive` checked in both `validate` and reserve.
- Amount frozen at reserve (`amountBefore/After`) — editing a coupon doesn't affect in-flight payments.
- Webhook confirm idempotent (duplicate `PAYMENT_PAID`).
- Reserve transactional with purchase; YooKassa failure → release/rollback.
- Typed errors → clear web messages: invalid / expired / already used / limit reached / not applicable to plan / below min amount.

## 10. Testing

- **Unit** — `computeFinalAmount`: all 3 types + edges (percent 0/100, fixed_amount > base, final_price < 100 → floor 1₽, final_price > base → base).
- **Validation** — expired, inactive, wrong scope, wrong plan, below `minAmount`, already used (per-user), cap reached.
- **Concurrency** — two simultaneous reserves on the last slot (exactly one wins); same-user double reserve (one wins).
- **Lifecycle** — reserve→confirm; reserve→release (cancel webhook); reserve→release (cron timeout); duplicate `PAYMENT_PAID` idempotency.
- **End-to-end** — admin create → client `validate` → purchase with `couponCode` → paid webhook → redemption `confirmed`, `redeemedCount += 1`.

## 11. Migration / rollout

- Dev: `synchronize` auto-creates the tables.
- Prod: re-enable the TypeORM migrations pipeline (data-source config, uncomment `migrations`/`migrationsRun` in `app.module.ts`), generate a migration for `coupon` + `coupon_redemption` (+ unique index, FKs). This also serves future coupon changes.

## 12. Files touched (summary)

**Backend (new):** `src/coupon/{coupon.module.ts, coupon.controller.ts, coupon.service.ts, entities/coupon.entity.ts, entities/coupon-redemption.entity.ts, dto/*}`; migration file; data-source config.
**Backend (edit):** `app.module.ts` (register entities + migrations), `order/dto/create-order.dto.ts`, `order/order.service.ts`, `order/services/order-payment.service.ts` (confirm/release on webhook), `subscription/dto/create-subscription-by-plan.dto.ts`, `subscription/subscription.service.ts`, `subscription/services/payment.service.ts`, cron for stale-reserve release.
**Admin (`mussor-admin`, new):** `src/modules/coupons/*`, `src/pages/coupons/index.tsx`; **edit:** `src/app/routing/routes.tsx`, `src/core/constants/routes.ts`, `src/core/components/layout/AdminNavBar.tsx`, localization.
**Web (`clenHouseWeb`, edit):** subscription purchase flow (promo-code input + validate call + pass `couponCode`), coupon api/types.
