# Assignment 2: Mid-Sprint Change Log & Scope Delta Analysis

**Client:** Solstice Events Co.  
**Project:** Event Check-In Kiosk Service  

---

## 1. Architectural Pivot Summary
The vendor deprecated the synchronous REST badge-printing API. The architecture was converted to an asynchronous pattern:
* **Pre-Pivot:** Client calls API $\rightarrow$ System calls Vendor REST $\rightarrow$ Synchronous Wait $\rightarrow$ DB updated to `CHECKED_IN`.
* **Post-Pivot:** Client calls API $\rightarrow$ DB updated to `PENDING` $\rightarrow$ Print job published to queue $\rightarrow$ Vendor posts Webhook callback $\rightarrow$ Signature verified $\rightarrow$ DB updated to `CHECKED_IN`.

---

## 2. Backlog Scope Delta Matrix

| Feature / Task | Change Type | Reason for Change |
| :--- | :--- | :--- |
| `POST /api/legacy-checkin` | **Deprecated** | Vendor removed synchronous endpoint support. |
| `POST /api/checkin` (Immediate Response) | **Modified** | Returns HTTP 202 with `PENDING` state instead of waiting for print completion. |
| `POST /api/webhooks/printer` | **Added** | Required to receive asynchronous callback notifications from printer vendor. |
| HMAC SHA-256 Signature Verification | **Added** | Ensures callbacks originate authentically from vendor without tampering. |
| Out-of-Order / Idempotency Guard | **Added** | Prevents duplicate processing if callbacks arrive out of order or repeat. |

---

## 3. Regression & Integrity Verification Report

* **Duplicate-Scan Test Case 1 (Pre-Checkin):** Scanning `ATT-003` (already `CHECKED_IN`) returns `400 Bad Request`. **Passed.**
* **Duplicate-Scan Test Case 2 (Pending State):** Rapidly scanning `ATT-001` twice triggers `PENDING` on scan 1 and blocks scan 2 with `400 Bad Request`. **Passed.**
* **Webhook Security Test:** Sending webhook payload with incorrect signature returns `403 Forbidden`. **Passed.**
* **State Completion Test:** Sending valid HMAC signature webhook payload transitions `ATT-001` from `PENDING` to `CHECKED_IN`. **Passed.**