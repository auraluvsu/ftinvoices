# Database schema

The app stores everything in Supabase: three Postgres tables and one private storage bucket. The SQL lives in [`supabase/schema.sql`](../supabase/schema.sql). Run it once in the Supabase dashboard (SQL Editor → New query → paste → Run).

```
auth.users (Supabase)
   │ 1
   │
   │ many
clients ──1──< categories ──1──< receipts >──── storage: receipts/{user}/{client}/{receipt}-{ts}.jpg
   └──────────────1───────────────< (receipts.client_id)
```

Each user has many clients. Each client has its own categories and receipts, and every receipt belongs to exactly one category **of the same client**.

## Tables

### `clients`
One set of books per client.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, generated |
| `user_id` | uuid | Owner. Defaults to the signed-in user (`auth.uid()`); deleted with the user |
| `name` | text | Required, not blank |
| `vat_number` | text | Optional, printed on exports |
| `vat_quarter_stagger` | smallint | `0` = quarters end Mar/Jun/Sep/Dec, `1` = Apr/Jul/Oct/Jan, `2` = May/Aug/Nov/Feb |
| `created_at` | timestamptz | Set on insert |

### `categories`
Per-client categories, each with a display colour.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `client_id` | uuid | The client it belongs to; deleted with the client |
| `name` | text | Required. **Unique per client, ignoring case** (`Fuel` and `fuel` can't both exist) |
| `color` | text | Lower-case hex, e.g. `#e3120b` (checked by the database) |
| `created_at` | timestamptz | Set on insert |

`unique (id, client_id)` exists so receipts can enforce that their category belongs to the same client (see below).

### `receipts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key (the app generates it so the image path can use it) |
| `user_id` | uuid | Owner |
| `client_id` | uuid | Deleted with the client |
| `category_id` | uuid | Must be a category of the **same client** |
| `name` | text | Supplier / description, required |
| `total` | numeric(12,2) | Gross amount including VAT, ≥ 0 |
| `vat` | numeric(12,2) | VAT amount, ≥ 0 and never more than `total` |
| `date` | date | Receipt date |
| `image_path` | text | Path of the photo in the storage bucket, or null |
| `created_at` | timestamptz | Set on insert; used to break ties when sorting |
| `updated_at` | timestamptz | Updated automatically by a trigger. Edits only apply if it still matches the value the app loaded, so an old copy on another device can't silently overwrite a newer edit |

Index: `(client_id, date desc)` for loading a client's receipts newest first.

## Rules the database enforces

- **Category belongs to the same client.** The foreign key `(category_id, client_id) → categories(id, client_id)` means a receipt can't point at another client's category.
- **Categories in use can't be deleted** (`on delete restrict`). The app's *Merge…* action moves the receipts to another category first, then deletes it.
- **Deleting a client deletes its categories and receipts** (`on delete cascade`). Image files are not removed automatically.
- **Sensible amounts**: totals and VAT can't be negative, and VAT can't exceed the total.

## Triggers

| Trigger | When | What it does |
|---|---|---|
| `clients_seed` | After a client is created | Adds the 8 default categories with their colours: Equipment `#2f5bd3`, Fuel `#e3120b`, Meals & entertainment `#d1149a`, Office supplies `#00b4d8`, Software & subscriptions `#b8860b`, Travel `#ffffff`, Utilities `#228b22`, Other `#ff8c00` |
| `receipts_touch` | Before a receipt is updated | Sets `updated_at` to now |

## Row-level security

RLS is enabled on all three tables, so every query only sees rows owned by the signed-in user:

- `clients`: `user_id = auth.uid()` for reading and writing.
- `categories` and `receipts`: `user_id = auth.uid()`, and on insert/update the `client_id` must be one of the user's own clients.

Signed-out requests (anon key with no session) see nothing.

## Image storage

- Bucket `receipts` is **private** (not public).
- Files are stored as `{user_id}/{client_id}/{receipt_id}-{timestamp}.jpg`. The timestamp makes a replaced image get a new path, so a cached old link never shows the wrong picture.
- A storage policy allows access only when the first folder of the path is the signed-in user's id.
- The app displays images through signed links that expire after 12 hours and re-creates them every 6 hours while open.
- When an image is replaced or removed, the old file is deleted. When a receipt is deleted, its image is kept for a few seconds so Undo can restore it, then deleted. If the tab closes during those seconds, the delete is sent straight away.
- **Client settings → Check for unused photos** finds files in the client's folder that no receipt points at (for example, left by a failed request) and offers to delete them.

## How the app maps rows

`src/lib/db.ts` converts rows to the app's `Receipt` shape (camelCase, numbers as numbers, timestamps as milliseconds). The category **name** isn't stored on receipts. It's joined from `categories` by `category_id`, so renaming a category updates every receipt instantly.
