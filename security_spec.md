# Security Specification & TDD Plan (`firestore.rules`)

## 1. Data Invariants
1. **Master Ownership Gate**: Every document under `/users/{userId}` and `/users/{userId}/conversions/{conversionId}` belongs strictly to the authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Identity Integrity**: On `create`, `uid == userId` (for `UserProfile`) and `ownerId == request.auth.uid` (for `SavedConversion`), and `id == conversionId`. On `update`, `uid`, `ownerId`, `id`, and `createdAt` are strictly immutable.
3. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates `isValidId(userId)` and `isValidId(conversionId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
4. **Strict Keys & Schema Bounds**: Every `create` validates exact `keys().hasAll(...)` and `keys().hasOnly(...)`; every `update` uses action-based `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`. Every string and list enforces explicit `.size()` upper bounds.
5. **Temporal Integrity**: `createdAt == request.time` on `create`; `createdAt == existing().createdAt && updatedAt == request.time` on `update`.
6. **Secure List Queries**: `allow list` on `/users/{userId}/conversions` explicitly enforces `isOwner(userId) && resource.data.ownerId == request.auth.uid` without `get()`/`exists()` calls.

## 2. "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write to `/users/{userId}/conversions/{id}` -> **DENIED**
2. Unverified email (`email_verified == false`) write to `/users/{userId}` -> **DENIED**
3. Cross-user read/list/write (`auth.uid != userId`) -> **DENIED**
4. Shadow field injection (`isAdmin: true`) in `create` or `update` -> **DENIED** (`hasOnly`)
5. Spoofed `ownerId` (`ownerId != request.auth.uid`) in `SavedConversion` -> **DENIED**
6. ID poisoning (`conversionId` > 128 chars or containing spaces/slashes) -> **DENIED** (`isValidId`)
7. Client-forged `createdAt` or `updatedAt` timestamp != `request.time` -> **DENIED**
8. Mutating immutable `ownerId` or `createdAt` during `update` -> **DENIED**
9. Oversized `title` (> 300 chars) or `fileName` (> 255 chars) -> **DENIED**
10. Invalid `sourceFormat` (e.g. `'exe'`) or `detectedScript` enum -> **DENIED**
11. Unbounded `blocks` (> 400 items) or `sheets` (> 30 items) DoW payload -> **DENIED**
12. Negative `fileSizeBytes` or `ethiopicCharCount` -> **DENIED**
