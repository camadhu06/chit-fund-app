<div align="center">

# 📒 ChitBook

### Chit Fund Management System

A full-stack web application for managing chit funds (members, groups, monthly auctions,
installments and payments), with the business rules enforced **inside a PostgreSQL database**.

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

*DBMS Case Study · 5th Semester*

</div>

---

## 📖 Table of Contents
- [About the Project](#-about-the-project)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [How a Chit Fund Works](#-how-a-chit-fund-works)
- [Database Design](#️-database-design)
- [How Data Flows](#-how-data-flows)
- [API Reference](#-api-reference)
- [Demo Walkthrough](#-demo-walkthrough)
- [Project Structure](#-project-structure)

---

## 🎯 About the Project

A **chit fund** is a popular community savings-and-loan scheme in India. Running one by hand
means tracking who paid, who won each month's auction, how much dividend everyone gets, and who
is behind on payments. On paper or in spreadsheets, that is error-prone work.

**ChitBook** automates all of this. The core idea of this DBMS project: **the database itself
guarantees correctness**. Constraints, triggers, views and stored functions calculate payouts,
generate installments, block invalid data and keep an audit trail, so the rules hold no matter
how data is entered.

## ✨ Features

| Module | What it does |
|---|---|
| 📊 **Dashboard** | Total collections, overdue amount, defaulter count, monthly collection chart, recent payments |
| 👥 **Members** | Add, view and delete members; see each member's dues and full account statement |
| 🏦 **Chit Groups** | Create groups, enroll members (tickets auto-numbered), track group status |
| 🔨 **Auctions** | Conduct monthly auctions with a live preview of commission, dividend and payout |
| 💳 **Payments** | Record full or partial payments (cash / UPI / bank transfer / cheque) |
| 📑 **Reports** | Defaulters list with days overdue, and a complete audit log of every change |
| 🧪 **SQL Lab** | Run your own read-only SQL queries, browse the schema, try one-click example queries |

## 🛠 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Database | **PostgreSQL 17** (via **PGlite** or Docker) | Triggers, PL/pgSQL, views, JSONB, window functions |
| Backend API | **Hono** on **Node.js 24** | Small, fast web framework; Node 24 runs TypeScript directly |
| Validation | **Zod** | Checks request data before it reaches SQL |
| DB access | Plain parameterised SQL (`pg` / PGlite) | No ORM, so all SQL is visible |
| Frontend | **React 19** + **Vite** + **React Router** | Modern web UI |
| Styling | **Tailwind CSS 4** | Utility-first CSS |
| Language | **TypeScript** | Type safety end to end |

## 🚀 Getting Started

### Prerequisites
- **[Node.js](https://nodejs.org/) 24 or newer** (check with `node -v`)
- Nothing else. **No database installation is needed:** the app uses **PGlite**, the real
  PostgreSQL engine compiled to WebAssembly, and stores its data in `./data/pgdata`.

### Installation

Download or clone this repository, open a terminal in the project folder, and run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. On the first run the database is created and
filled with sample data automatically (14 members, 3 groups, 6 auctions, 51 payments).

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API (port 3001) and the web app (port 5173) together |
| `npm run db:reset` | Wipe the database and reload sample data *(stop the dev server first)* |
| `npm run build` | Build the frontend for production into `dist/` |
| `npm start` | Run the API and serve the built frontend on port 3001 |
| `npm run typecheck` | Check the TypeScript code for errors |

### Optional: use a full PostgreSQL server (Docker)

With Docker Desktop running, start PostgreSQL 17 and pgAdmin:

```bash
docker compose up -d
```

Then start the app pointing at it:

```bash
DATABASE_URL="postgres://chit:chit@localhost:5432/chitfund" npm run dev
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgres://chit:chit@localhost:5432/chitfund"; npm run dev
```

pgAdmin opens at **http://localhost:5050** (login `admin@example.com` / `admin`).
These credentials are for local development only.

| Environment variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(unset, uses PGlite)* | Connect to an external PostgreSQL server |
| `API_PORT` | `3001` | Port for the API server |

---

## 💡 How a Chit Fund Works

A **chit fund** is a group savings-plus-loan scheme, popular in India.

1. A **foreman** (organiser) starts a group with a fixed **chit value** (e.g. ₹1,00,000) and a fixed number of **members** (e.g. 10).
2. The group runs for as many **months as there are members** (10 members → 10 months).
3. Every month, each member pays **chit value ÷ members** (₹10,000).
4. Every month, the pot is **auctioned**. Members who have not won yet bid a **discount**: how much of the pot they are willing to give up to get the money now. The **highest discount wins**.
5. The winner receives **chit value − discount**.
6. The foreman keeps a **commission** (max 5% of the chit value under the Chit Funds Act, 1982) out of the discount.
7. The rest of the discount is a **dividend**, shared equally by all members, so everyone pays less that month.
8. **Each member wins exactly once.** In the last month only one member is left, so the discount is just the commission.

People who need money early take the pot at a discount (like a loan). People who wait pay less over time thanks to the dividends (like savings).

**Worked example** (₹1,00,000 chit, 10 members, 5% commission, month 1 winning bid ₹20,000):

| Step | Formula | Amount |
|---|---|---|
| Monthly contribution | 1,00,000 ÷ 10 | ₹10,000 |
| Winner receives | 1,00,000 − 20,000 | **₹80,000** |
| Foreman commission | 5% × 1,00,000 | ₹5,000 |
| Dividend per member | (20,000 − 5,000) ÷ 10 | ₹1,500 |
| Each member pays this month | 10,000 − 1,500 | **₹8,500** |

The database does all of this arithmetic itself, in the `trg_auction_before_insert` trigger.

## 🗄️ Database Design

### ER diagram

```mermaid
erDiagram
    MEMBERS     ||--o{ ENROLLMENTS  : "joins via"
    CHIT_GROUPS ||--o{ ENROLLMENTS  : "has tickets"
    CHIT_GROUPS ||--o{ AUCTIONS     : "holds monthly"
    ENROLLMENTS ||--o| AUCTIONS     : "wins (at most once)"
    AUCTIONS    ||--o{ INSTALLMENTS : "generates"
    ENROLLMENTS ||--o{ INSTALLMENTS : "owes"
    INSTALLMENTS ||--o{ PAYMENTS    : "is paid by"
```

(VS Code shows this diagram with a Mermaid preview extension, and GitHub draws it automatically. As plain text:)

```
members 1──N enrollments N──1 chit_groups
                 │  1                │ 1
                 │  └──0..1 auctions N┘          (a ticket wins at most once)
                 │ 1          │ 1
                 └──N installments N             (one per member per month)
                         │ 1
                         └──N payments           (part payments allowed)
audit_log  ← filled automatically by triggers
```

### Relationships and cardinality

| Relationship | Type | How it is implemented |
|---|---|---|
| Member ↔ Chit group | **M : N** | Resolved by the associative entity `enrollments` |
| Chit group → Auctions | 1 : N | `auctions.group_id` FK, UNIQUE(group_id, month_no) |
| Enrollment → Auction won | 1 : 0..1 | `auctions.winner_enrollment_id` FK + UNIQUE |
| Auction → Installments | 1 : N | One installment per enrolled member, created by a trigger |
| Enrollment → Installments | 1 : N | One per month |
| Installment → Payments | 1 : N | Several partial payments allowed |

### Tables (data dictionary)

**1. `members`**: people who subscribe to chits

| Column | Type | Constraints |
|---|---|---|
| member_id | INT | **PK**, identity (auto-number) |
| full_name | VARCHAR(100) | NOT NULL, CHECK at least 2 characters |
| phone | VARCHAR(15) | NOT NULL, **UNIQUE**, CHECK 3–15 digits |
| email | VARCHAR(120) | UNIQUE, CHECK contains `@` (optional) |
| address | TEXT | optional |
| joined_on | DATE | NOT NULL, DEFAULT today |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**2. `chit_groups`**: one chit scheme

| Column | Type | Constraints |
|---|---|---|
| group_id | INT | **PK**, identity |
| group_name | VARCHAR(80) | NOT NULL, **UNIQUE** |
| chit_value | NUMERIC(12,2) | NOT NULL, CHECK ≥ 1000 |
| total_members | SMALLINT | NOT NULL, CHECK 5–50 (= duration in months) |
| monthly_contribution | NUMERIC(12,2) | **GENERATED** = chit_value ÷ total_members |
| commission_pct | NUMERIC(4,2) | DEFAULT 5, CHECK 0–5 |
| max_bid_pct | NUMERIC(4,2) | DEFAULT 40, CHECK 5–40 |
| start_date | DATE | NOT NULL |
| status | ENUM group_status | `open` → `active` → `completed` (changed by triggers) |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Table-level CHECK: max_bid_pct ≥ commission_pct.

**3. `enrollments`**: a member's ticket in a group

| Column | Type | Constraints |
|---|---|---|
| enrollment_id | INT | **PK**, identity |
| group_id | INT | **FK** → chit_groups, ON DELETE CASCADE |
| member_id | INT | **FK** → members, ON DELETE RESTRICT |
| ticket_no | SMALLINT | NOT NULL, set by trigger |
| enrolled_on | DATE | DEFAULT today |

UNIQUE(group_id, member_id) · UNIQUE(group_id, ticket_no)

**4. `auctions`**: the result of each monthly auction

| Column | Type | Constraints |
|---|---|---|
| auction_id | INT | **PK**, identity |
| group_id | INT | **FK** → chit_groups, CASCADE |
| month_no | SMALLINT | CHECK ≥ 1, must be next in sequence (trigger) |
| auction_date | DATE | DEFAULT today |
| winner_enrollment_id | INT | **FK** → enrollments, **UNIQUE** (wins once) |
| bid_discount | NUMERIC(12,2) | CHECK ≥ 0, range checked by trigger |
| commission | NUMERIC(12,2) | computed by trigger |
| dividend_per_member | NUMERIC(12,2) | computed by trigger |
| payout_amount | NUMERIC(12,2) | computed by trigger |

UNIQUE(group_id, month_no)

**5. `installments`**: what each member owes each month (created automatically)

| Column | Type | Constraints |
|---|---|---|
| installment_id | INT | **PK**, identity |
| enrollment_id | INT | **FK** → enrollments, CASCADE |
| auction_id | INT | **FK** → auctions, CASCADE |
| month_no | SMALLINT | NOT NULL |
| amount_due | NUMERIC(12,2) | CHECK ≥ 0 |
| amount_paid | NUMERIC(12,2) | DEFAULT 0, CHECK ≥ 0 and ≤ amount_due |
| due_date | DATE | auction date + 10 days |
| status | VARCHAR(10) | **GENERATED**: `paid` / `partial` / `pending` |

UNIQUE(enrollment_id, month_no)

**6. `payments`**: every amount received

| Column | Type | Constraints |
|---|---|---|
| payment_id | INT | **PK**, identity (the receipt number) |
| installment_id | INT | **FK** → installments, ON DELETE RESTRICT |
| amount | NUMERIC(12,2) | CHECK > 0; over-payment blocked by trigger |
| mode | ENUM payment_mode | `cash` / `upi` / `bank_transfer` / `cheque` |
| reference_no | VARCHAR(50) | Named CHECK `reference_required_for_non_cash`. Any value works; the app makes one up if left blank |
| paid_on | TIMESTAMPTZ | DEFAULT now() |

**7. `audit_log`**: automatic change history

| Column | Type | Notes |
|---|---|---|
| audit_id | BIGINT | **PK**, identity |
| table_name | TEXT | which table changed |
| operation | TEXT | INSERT / UPDATE / DELETE |
| row_data | JSONB | full copy of the row |
| changed_at | TIMESTAMPTZ | when |

### Normalization
- **1NF:** every column holds one atomic value, with no repeating groups. A member in 3 groups gets 3 `enrollments` rows instead of 3 columns.
- **2NF:** every table has a single-column surrogate key, so there are no partial dependencies.
- **3NF:** no transitive dependencies. For example, the member's name lives only in `members`. `installments` reaches it through `enrollment_id` and doesn't copy it.
- **Derived values** (`monthly_contribution`, `status`) are GENERATED columns, so they can never go out of sync.

### Indexes

| Index | Purpose |
|---|---|
| Primary keys and UNIQUE constraints | created automatically |
| `idx_enrollments_member`, `idx_auctions_group`, `idx_installments_auction`, `idx_payments_installment` | speed up JOINs on foreign keys |
| `idx_installments_unpaid` | **partial index** (`WHERE status <> 'paid'`) for the defaulters report |
| `idx_payments_paid_on` | recent payments, sorted by date |

### Triggers (business rules inside the database)

| Trigger | When | What it does |
|---|---|---|
| `enrollment_before_insert` | BEFORE INSERT on enrollments | Rejects a full or non-open group; assigns the next ticket no.; uses `SELECT … FOR UPDATE` locking |
| `enrollment_after_insert` | AFTER INSERT on enrollments | Group becomes `active` when full |
| `auction_before_insert` | BEFORE INSERT on auctions | Months in order; winner in group and not won before; bid within limits; computes commission, dividend, payout |
| `auction_after_insert` | AFTER INSERT on auctions | Creates installments for every member; marks group `completed` after the last month |
| `payment_after_insert` | AFTER INSERT on payments | Adds to `amount_paid`; rejects over-payment |
| `audit_*` (5 triggers) | AFTER INSERT/UPDATE/DELETE on members, chit_groups, enrollments, auctions, payments | Writes a JSONB copy of the row to `audit_log` |

### Views and functions

| Object | Type | Used by |
|---|---|---|
| `v_group_summary` | View | Groups page, Dashboard |
| `v_member_dues` | View | Members page |
| `v_defaulters` | View | Reports → Defaulters |
| `fn_member_statement(member_id)` | Function returning a table | Member page statement |
| `fn_auction_preview(group_id, discount)` | Function | Live preview in the auction dialog |


## 🔄 How Data Flows

```
Browser (React) ──HTTP/JSON──▶ API (Hono + Zod) ──parameterised SQL──▶ PostgreSQL
                                                                         │
                                    triggers compute, validate and log ◀─┘
```

Data gets in two ways, and both end up as ordinary SQL `INSERT` statements:

1. **Sample data:** on first run, `server/db.ts` runs `db/schema.sql` (creates everything) and then
   `db/seed.sql` (sample data). `npm run db:reset` does the same again.
2. **Through the app:** forms send data to the API in `server/index.ts`, which validates it with
   Zod and runs a parameterised `INSERT … VALUES ($1, $2, …)`, which is safe from SQL injection.

Once a row arrives, the **triggers take over**. For example, saving one auction automatically
creates an installment row for every member, plus an audit row. Every INSERT, UPDATE and DELETE on
the main tables is copied into **`audit_log`** as JSON, visible under **Reports → Audit log**.

## 🔌 API Reference

All endpoints are under `/api`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Summary stats, monthly collections, recent payments |
| GET, POST | `/members` | List members with dues / add a member |
| GET, DELETE | `/members/:id` | Member details and statement / delete a member |
| GET, POST | `/groups` | List groups / create a group |
| GET | `/groups/:id` | Group details, members, auctions |
| POST | `/groups/:id/enroll` | Enroll a member in a group |
| GET | `/groups/:id/auction-preview?discount=` | Preview payout, commission and dividend |
| POST | `/groups/:id/auctions` | Conduct the next monthly auction |
| GET | `/groups/:id/installments?month=` | Installments for a given month |
| GET, POST | `/payments` | List recent payments / record a payment |
| GET | `/reports/defaulters` | Members with overdue installments |
| GET | `/reports/audit` | Latest 100 audit log entries |
| POST | `/sql` | Run a read-only SQL query (SQL Lab) |
| GET | `/schema` | List all tables, views and columns |
| POST | `/admin/reset` | Reset the database to sample data |

## 🎬 Demo Walkthrough

**1. Add a record and see it logged**
1. Go to **Members → + Add member**, enter name `Test Student` and phone `12345`, and save.
2. Open **SQL Lab** and click **Audit log: latest changes**. The top row is `members | INSERT`, with your data as JSON.

**2. Record a payment**
1. Open **Chit Groups → Diwali Savers → Installments**, pick a month, and click **Pay** on an unpaid row.
2. Choose UPI, type any reference (or leave it blank), and save.
3. The installment's `amount_paid` and `status` update by themselves. That's the `payment_after_insert` trigger.
4. Try paying more than the balance: the error comes straight from the database.

**3. Conduct an auction** (uses the most triggers)

On Diwali Savers, click **Conduct month 7 auction**, pick a winner and confirm. Then in SQL Lab:

```sql
SELECT * FROM auctions ORDER BY auction_id DESC LIMIT 1;   -- commission and dividend computed
SELECT count(*) FROM installments WHERE month_no = 7;       -- installments created automatically
```

**Exploring the database**
- SQL Lab's schema browser lists every table and view with its columns.
- One-click examples cover JOINs, GROUP BY/HAVING, window functions, CTEs, correlated subqueries,
  the trigger catalog and `EXPLAIN ANALYZE` (showing the partial index in use).
- SQL Lab runs inside a `READ ONLY` transaction using the extended protocol, so `DELETE`, `DROP`
  and multi-statement injection are refused.
- With Docker, pgAdmin's **ERD For Database** draws the ER diagram.

> **Note:** inputs are deliberately lenient for easy testing. Phone: any 3–15 digits (must be unique).
> Email: optional, must contain `@`. Payment reference: anything, or leave it blank to auto-generate one.

## 📁 Project Structure

```
├── db/
│   ├── schema.sql          # Tables, constraints, indexes, triggers, views, functions
│   └── seed.sql            # Sample data
├── server/
│   ├── db.ts               # Database connection (PGlite or PostgreSQL)
│   ├── index.ts            # REST API routes (Hono)
│   └── reset.ts            # Script behind `npm run db:reset`
├── src/
│   ├── pages/              # Dashboard, Members, Groups, Payments, Reports, SQL Lab…
│   ├── PayModal.tsx        # Payment dialog
│   ├── ui.tsx, lib.ts      # Shared UI components and helpers
│   └── main.tsx            # App entry point and routes
├── docker-compose.yml      # Optional PostgreSQL + pgAdmin
├── index.html
├── package.json
└── vite.config.ts
```

---

<div align="center">

Made as a **DBMS Case Study** project · 5th Semester

</div>
