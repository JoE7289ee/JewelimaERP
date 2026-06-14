# Jewelima

**Gold & diamond jewellery manufacturing management, built on Frappe / ERPNext (v16).**

Jewelima extends ERPNext with the concepts a jewellery workshop actually runs on — gold tracked by **weight and purity**, stones by **count and carats**, and a shop‑floor flow where a piece moves bench‑to‑bench, losing a little weight at each stage (filings, casting dust) that is collected for refining.

It is built as a thin, opinionated layer **on top of** standard ERPNext: native Stock Ledger, Work Order and BOM keep doing their job, while Jewelima adds the jewellery‑specific ledgers, masters, job cards and material flow.

---

## Table of contents

- [Core concepts](#core-concepts)
- [Item flags](#item-flags)
- [Ledgers](#ledgers)
- [Purchasing](#purchasing)
- [Manufacturing](#manufacturing)
- [Material flow & warehouses](#material-flow--warehouses)
- [Loss handling](#loss-handling)
- [Product info & weights](#product-info--weights)
- [Masters & seeded data](#masters--seeded-data)
- [Desk workspace](#desk-workspace)
- [Installation](#installation)
- [Doctype reference](#doctype-reference)

---

## Core concepts

| Concept | What it means |
|---|---|
| **Job Order** | The custom front page for an order/piece. Holds the design, the materials on the job, the required stages, the product spec, and the transfer history. Drives the whole flow. |
| **Job Card (stage)** | One doctype per manufacturing stage (CAD, Casting, Filing …). Each is a "bench" where work — and weight loss — is recorded. |
| **Bench warehouse** | Every physical stage has its own warehouse; material physically lives in the bench it's currently at. |
| **Soft reservation** | Committing gold to a job is *informational* — no stock is moved, so you always know how much stock is free for new orders. |
| **Issue** | Material physically enters a job card via a barcode‑scan Issue screen (from a store warehouse to the bench). |

---

## Item flags

Jewelima adds fields to the standard **Item** (collapsible "Jewelima" section):

- **Keep Metal Ledger** + **Default Purity** (24K / 22K / 18K / 14K) — the item is tracked in the Metal Ledger.
- **Keep Stone Ledger** + **Stone Type / Stone Sieve / Stone Size** — the item is tracked in the Stone Ledger.

These flags drive everything else. ERPNext's native Stock Ledger always runs for stock items; the Jewelima ledgers are *additional*.

---

## Ledgers

### Metal Ledger Entry
Tracks **gold weight by purity** with a running balance, independent of money/valuation.
`item · purity · in/out weight · balance weight · voucher`.

### Stone Ledger Entry
Tracks stones in **both pieces and carats**, by `stone type · sieve · size`, each with a running balance.

Both are posted automatically — see [Purchasing](#purchasing).

---

## Purchasing

### Raw Material Purchase
A deliberately minimal purchase screen: pick a **supplier**, a **target warehouse** (defaults to *Raw Materials Store*; group warehouses are blocked), add raw materials with qty + rate, and **Submit** — goods are in the warehouse. Behind the scenes it creates and submits a real ERPNext **Purchase Receipt**.

### Automatic Metal Ledger posting
Submitting a **Purchase Receipt** or **Purchase Invoice** automatically posts a **Metal Ledger Entry** for every Keep‑Metal‑Ledger line. It posts only when the document actually moves stock (PR always; PI when *Update Stock* is on), so a PI raised against a PR never double‑counts. Cancelling reverses the entries and recomputes balances.

---

## Manufacturing

### Job Order
The custom work‑order front, organised into tabs:

- **Details** — design name, production item, BOM, qty, status, work order, reservation, and the **Materials on Job** table (auto‑filled from the BOM).
- **Product Info** — read‑only product spec, mirrored live from the cards.
- **Stages** — pick which stages the piece needs (toggle buttons for all 12; drag to reorder).
- **Transfers** — full history of stage‑to‑stage moves.
- **Other** — items / notes.

**Lifecycle**
- **Start** → if **CAD** is included it's treated as a **new design**: the Job Order can be created with no Design Name / Item / BOM; those are filled during CAD, and the **Work Order is created when CAD completes**. Otherwise the Work Order is created immediately.
- The ERPNext **Work Order is out‑of‑box** (native ID, your BOM) but created with **`skip_transfer`** and left in Draft, so it makes **zero native stock‑ledger moves** — Jewelima drives all material movement.
- Stages are created **sequentially** (the next card opens when the current one completes).
- **Edit‑protection**: stages already started can't be reordered/removed (only stages after them); **completed cards are read‑only**; a **completed Job Order is fully read‑only** (server + client).

### The 12 job cards / stages
`CAD · CAM · Tree Making · Casting · Grinding · Filing · Setting · Pre Polish · Wax Setting · Final Polish · Wax Cleaning · Bag Extraction`

Each card records the **employee/smith**, **time in/out**, **status** (In Queue / In Progress / Completed / OnHold / Cancelled), its **materials (bench)**, a **bench‑stock** reconciliation panel, and **Product Info** (weights & stones). CAD and CAM are design stages with no warehouse.

---

## Material flow & warehouses

```
Raw Materials Store ──issue──► Casting bench ──complete──► Filing bench ──► … ──► Finished Goods
   (free stock)                    │ loss stays at the bench
                                   ▼
                             Casting -LOSS  (via the Loss page)
```

1. **Reserve (soft)** — starting a job creates a **Material Reservation** (informational; no stock moved) listing the committed materials. Lines flip **Reserved → Delivered** as they're issued; the reservation is deleted when the job completes. Free stock = Raw Materials Store balance.
2. **Issue** — the **Material Issue** screen: choose Gold/Stone, **scan the Job Order barcode**, and it finds the current card, its bench, the source store and what's needed. Submitting moves stock (store → bench) **and** records it on the card.
3. **Stage transfer** — when a card is **completed**, its output is transferred to the **next stage's bench**; the **loss stays** at the current bench. Each transition is logged in the Job Order's **Transfers** tab (time, whether material moved, link to the stock entry).
4. **Bench‑stock reconciliation** — every card shows the bench warehouse's **live stock** vs what's on the card, flagging any **unaccounted** quantity.

---

## Loss handling

Loss is **entered on the card** (the output weight is less than the input; the shortfall is the loss) and **physically stays in the bench warehouse**.

Transferring loss for refining is done on a dedicated **Loss Transfer** screen (not on the card):

1. Pick a **bench** (Casting, Grinding, Filing, Setting, Pre Polish, Final Polish).
2. It shows the **loss currently sitting** there per raw material = total loss recorded on that bench's cards − loss already transferred.
3. Choose how much to send → **Submit** moves it to that bench's **`-LOSS`** warehouse.

---

## Product info & weights

Captured on every job card **and** mirrored (read‑only) onto the Job Order:

| Field | Notes |
|---|---|
| DMD / PS / CS — **No** and **Weight (ct)** | diamond / precious / colour stone counts & carats (.000) |
| **Gross Weight (g)** | total product weight |
| **Nett Weight (g)** | = Gross − (total stone carats × 0.2)  *(auto)* |
| **Purity (%)** | percent gold |
| **Pure Weight (g)** | = Nett × Purity ÷ 100  *(auto)* |

Carat→gram uses 1 ct = 0.2 g. Nett and Pure recompute live and are enforced on save.

---

## Masters & seeded data

Created automatically on install / setup:

- **Gold raw materials**: `RM-24-YG, RM-22-YG, RM-18-YG, RM-18-WG, RM-18-PG, RM-14-YG` (YG/WG/PG = yellow/white/pink gold), all Keep‑Metal‑Ledger, UOM Gram, not for sale.
- **Stone Type** master: Diamond, Precious Stone, Color Stone. **Stone Sieve** master (sieve + size range).
- **Warehouses**: `Raw Materials Store`, `Stone Issue`, a **Manufacturing** group with a warehouse per physical stage, and a **Loss Collection** group with a `<Stage> -LOSS` warehouse per loss‑producing stage.

---

## Desk workspace

A **Jewelima** workspace + sidebar (diamond app icon) groups everything: Raw Material Purchase, Job Order, Material Issue, Loss Transfer, Material Reservation, Work Order, the ledgers, and the masters.

---

## Installation

Jewelima targets **Frappe v16 / ERPNext v16**.

```bash
bench get-app https://github.com/JoE7289ee/JewelimaERP.git --branch v0.0.1
bench --site <site> install-app jewelima
bench --site <site> migrate
```

On a fresh site the seeding (warehouses, raw materials) runs once the ERPNext **setup wizard** completes (a `setup_wizard_complete` hook). For a fully hands‑off deploy, `jewelima.setup.run_initial_setup` can complete the wizard programmatically.

A reference one‑shot deploy script (`setup_jewelima.sh`) pins Frappe/ERPNext to **v16.22.0** and stands up the whole stack (Colima + frappe_docker devcontainer) with no manual setup.

---

## Doctype reference

| Doctype | Purpose |
|---|---|
| Metal Ledger Entry | Gold weight + purity ledger |
| Stone Ledger Entry | Stone pieces + carats ledger |
| Stone Type / Stone Sieve | Stone masters |
| Raw Material Purchase (+ Item) | Simplified purchase → Purchase Receipt |
| Job Order (+ Item, + Material, + Stage, + Transfer) | The work‑order front |
| CAD, CAM, Tree Making, Casting, Grinding, Filing, Setting, Pre Polish, Wax Setting, Final Polish, Wax Cleaning, Bag Extraction (+ Stage Material) | The 12 job cards |
| Material Issue (+ Item) | Barcode issue of gold/stones to a card |
| Material Reservation (+ Item) | Informational reservation |
| Loss Transfer (+ Item) | Send bench loss to its `-LOSS` warehouse |

---

> Built with [Claude Code](https://claude.com/claude-code).
