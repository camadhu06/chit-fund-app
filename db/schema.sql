-- =====================================================================
--  ChitBook — Chit Fund Management System
--  Database schema (PostgreSQL 17+)
--
--  How a chit fund works (the business rules this schema enforces):
--   * A chit GROUP has a fixed chit value V and N members. It runs N months.
--   * Every month each member contributes V / N.
--   * Every month an AUCTION is held. Members who have not won yet bid a
--     "discount" D: the amount they are willing to give up to take the pot now.
--     The highest discount wins. Winner receives  V - D.
--   * The foreman (organiser) takes a commission F = commission_pct % of V
--     (capped at 5% under the Chit Funds Act, 1982) out of the discount.
--   * The rest of the discount (D - F) is a DIVIDEND shared by all N members,
--     so that month every member pays only  V/N - (D - F)/N.
--   * Each member can win only once. In the last month only one member is
--     left, so the discount is just the foreman's commission.
-- =====================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------------------------------------------------------------------
--  ENUM types
-- ---------------------------------------------------------------------
CREATE TYPE group_status AS ENUM ('open', 'active', 'completed');
CREATE TYPE payment_mode AS ENUM ('cash', 'upi', 'bank_transfer', 'cheque');

-- ---------------------------------------------------------------------
--  1. MEMBERS — people who subscribe to chits
-- ---------------------------------------------------------------------
CREATE TABLE members (
    member_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name   VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
    phone       VARCHAR(15)  NOT NULL UNIQUE CHECK (phone ~ '^\+?[0-9]{3,15}$'),  -- any 3–15 digits (demo-friendly)
    email       VARCHAR(120) UNIQUE CHECK (email IS NULL OR email LIKE '%_@_%'),
    address     TEXT,
    joined_on   DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  2. CHIT_GROUPS — one chit scheme
-- ---------------------------------------------------------------------
CREATE TABLE chit_groups (
    group_id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_name           VARCHAR(80)   NOT NULL UNIQUE,
    chit_value           NUMERIC(12,2) NOT NULL CHECK (chit_value >= 1000),
    total_members        SMALLINT      NOT NULL CHECK (total_members BETWEEN 5 AND 50),
    -- derived attribute stored as a GENERATED column (always consistent)
    monthly_contribution NUMERIC(12,2) GENERATED ALWAYS AS (round(chit_value / total_members, 2)) STORED,
    commission_pct       NUMERIC(4,2)  NOT NULL DEFAULT 5.00 CHECK (commission_pct BETWEEN 0 AND 5),
    max_bid_pct          NUMERIC(4,2)  NOT NULL DEFAULT 40.00 CHECK (max_bid_pct BETWEEN 5 AND 40),
    start_date           DATE          NOT NULL,
    status               group_status  NOT NULL DEFAULT 'open',
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (max_bid_pct >= commission_pct)
);

-- ---------------------------------------------------------------------
--  3. ENROLLMENTS — M:N relationship between members and groups.
--     Each enrollment is one "ticket" in a group.
-- ---------------------------------------------------------------------
CREATE TABLE enrollments (
    enrollment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id      INT      NOT NULL REFERENCES chit_groups(group_id) ON DELETE CASCADE,
    member_id     INT      NOT NULL REFERENCES members(member_id)    ON DELETE RESTRICT,
    ticket_no     SMALLINT NOT NULL,            -- auto-assigned by trigger
    enrolled_on   DATE     NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (group_id, member_id),
    UNIQUE (group_id, ticket_no)
);

-- ---------------------------------------------------------------------
--  4. AUCTIONS — one per group per month
-- ---------------------------------------------------------------------
CREATE TABLE auctions (
    auction_id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id             INT           NOT NULL REFERENCES chit_groups(group_id) ON DELETE CASCADE,
    month_no             SMALLINT      NOT NULL CHECK (month_no >= 1),
    auction_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
    -- UNIQUE: a ticket can win the pot only once
    winner_enrollment_id INT           NOT NULL UNIQUE REFERENCES enrollments(enrollment_id),
    bid_discount         NUMERIC(12,2) NOT NULL CHECK (bid_discount >= 0),
    -- computed by trigger
    commission           NUMERIC(12,2) NOT NULL DEFAULT 0,
    dividend_per_member  NUMERIC(12,2) NOT NULL DEFAULT 0,
    payout_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (group_id, month_no)
);

-- ---------------------------------------------------------------------
--  5. INSTALLMENTS — what each member owes for each month.
--     Rows are created automatically by a trigger after each auction.
-- ---------------------------------------------------------------------
CREATE TABLE installments (
    installment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id  INT           NOT NULL REFERENCES enrollments(enrollment_id) ON DELETE CASCADE,
    auction_id     INT           NOT NULL REFERENCES auctions(auction_id)       ON DELETE CASCADE,
    month_no       SMALLINT      NOT NULL,
    amount_due     NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
    amount_paid    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    due_date       DATE          NOT NULL,
    status         VARCHAR(10)   GENERATED ALWAYS AS (
                       CASE WHEN amount_paid >= amount_due THEN 'paid'
                            WHEN amount_paid > 0          THEN 'partial'
                            ELSE 'pending' END) STORED,
    UNIQUE (enrollment_id, month_no),
    CHECK (amount_paid <= amount_due)
);

-- ---------------------------------------------------------------------
--  6. PAYMENTS — every money receipt against an installment
-- ---------------------------------------------------------------------
CREATE TABLE payments (
    payment_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installment_id INT           NOT NULL REFERENCES installments(installment_id) ON DELETE RESTRICT,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    mode           payment_mode  NOT NULL DEFAULT 'cash',
    reference_no   VARCHAR(50),
    paid_on        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT reference_required_for_non_cash CHECK (mode = 'cash' OR reference_no IS NOT NULL)
);

-- ---------------------------------------------------------------------
--  7. AUDIT_LOG — filled automatically by a generic trigger
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    audit_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT        NOT NULL,
    operation  TEXT        NOT NULL,
    row_data   JSONB       NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  INDEXES on foreign keys / frequent filters
-- ---------------------------------------------------------------------
CREATE INDEX idx_enrollments_member   ON enrollments(member_id);
CREATE INDEX idx_auctions_group       ON auctions(group_id);
CREATE INDEX idx_installments_auction ON installments(auction_id);
CREATE INDEX idx_installments_unpaid  ON installments(due_date) WHERE status <> 'paid';  -- partial index
CREATE INDEX idx_payments_installment ON payments(installment_id);
CREATE INDEX idx_payments_paid_on     ON payments(paid_on DESC);

-- =====================================================================
--  TRIGGERS (business rules enforced inside the database)
-- =====================================================================

-- T1. Before enrolling: group must be open and not full; assign next ticket no.
CREATE FUNCTION trg_enrollment_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    g       chit_groups%ROWTYPE;
    taken   INT;
BEGIN
    -- row lock prevents two clerks over-filling the same group concurrently
    SELECT * INTO g FROM chit_groups WHERE group_id = NEW.group_id FOR UPDATE;
    IF g.status <> 'open' THEN
        RAISE EXCEPTION 'Group "%" is % and not accepting members', g.group_name, g.status;
    END IF;

    SELECT count(*) INTO taken FROM enrollments WHERE group_id = NEW.group_id;
    IF taken >= g.total_members THEN
        RAISE EXCEPTION 'Group "%" is already full (% members)', g.group_name, g.total_members;
    END IF;

    SELECT COALESCE(max(ticket_no), 0) + 1 INTO NEW.ticket_no
      FROM enrollments WHERE group_id = NEW.group_id;
    RETURN NEW;
END $$;

CREATE TRIGGER enrollment_before_insert
BEFORE INSERT ON enrollments
FOR EACH ROW EXECUTE FUNCTION trg_enrollment_before_insert();

-- T2. After enrolling: when the group becomes full, it becomes ACTIVE.
CREATE FUNCTION trg_enrollment_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE chit_groups g
       SET status = 'active'
     WHERE g.group_id = NEW.group_id
       AND (SELECT count(*) FROM enrollments e WHERE e.group_id = g.group_id) = g.total_members;
    RETURN NULL;
END $$;

CREATE TRIGGER enrollment_after_insert
AFTER INSERT ON enrollments
FOR EACH ROW EXECUTE FUNCTION trg_enrollment_after_insert();

-- T3. Before an auction: validate the bid and compute commission, dividend, payout.
CREATE FUNCTION trg_auction_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    g          chit_groups%ROWTYPE;
    done       INT;
    win_group  INT;
    max_disc   NUMERIC;
BEGIN
    SELECT * INTO g FROM chit_groups WHERE group_id = NEW.group_id FOR UPDATE;
    IF g.status <> 'active' THEN
        RAISE EXCEPTION 'Auctions can only be held for active groups (group is %)', g.status;
    END IF;

    SELECT count(*) INTO done FROM auctions WHERE group_id = NEW.group_id;
    IF NEW.month_no IS NULL THEN
        NEW.month_no := done + 1;
    ELSIF NEW.month_no <> done + 1 THEN
        RAISE EXCEPTION 'Next auction must be month %, not month %', done + 1, NEW.month_no;
    END IF;

    SELECT group_id INTO win_group FROM enrollments WHERE enrollment_id = NEW.winner_enrollment_id;
    IF win_group IS DISTINCT FROM NEW.group_id THEN
        RAISE EXCEPTION 'Winner is not a member of this group';
    END IF;
    IF EXISTS (SELECT 1 FROM auctions WHERE winner_enrollment_id = NEW.winner_enrollment_id) THEN
        RAISE EXCEPTION 'This ticket has already won the chit in an earlier month';
    END IF;

    NEW.commission := round(g.chit_value * g.commission_pct / 100, 2);
    max_disc       := round(g.chit_value * g.max_bid_pct / 100, 2);

    IF NEW.month_no = g.total_members THEN
        -- last month: no competition, discount = commission only
        NEW.bid_discount := NEW.commission;
    ELSIF NEW.bid_discount < NEW.commission OR NEW.bid_discount > max_disc THEN
        RAISE EXCEPTION 'Bid discount must be between % (commission) and % (% %% of chit value)',
            NEW.commission, max_disc, g.max_bid_pct;
    END IF;

    NEW.dividend_per_member := round((NEW.bid_discount - NEW.commission) / g.total_members, 2);
    NEW.payout_amount       := g.chit_value - NEW.bid_discount;
    RETURN NEW;
END $$;

CREATE TRIGGER auction_before_insert
BEFORE INSERT ON auctions
FOR EACH ROW EXECUTE FUNCTION trg_auction_before_insert();

-- T4. After an auction: raise the installment for every member; close the group after the last month.
CREATE FUNCTION trg_auction_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    g chit_groups%ROWTYPE;
BEGIN
    SELECT * INTO g FROM chit_groups WHERE group_id = NEW.group_id;

    INSERT INTO installments (enrollment_id, auction_id, month_no, amount_due, due_date)
    SELECT e.enrollment_id, NEW.auction_id, NEW.month_no,
           g.monthly_contribution - NEW.dividend_per_member,
           NEW.auction_date + 10
      FROM enrollments e
     WHERE e.group_id = NEW.group_id;

    IF NEW.month_no = g.total_members THEN
        UPDATE chit_groups SET status = 'completed' WHERE group_id = NEW.group_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER auction_after_insert
AFTER INSERT ON auctions
FOR EACH ROW EXECUTE FUNCTION trg_auction_after_insert();

-- T5. After a payment: add it to the installment, rejecting over-payment.
CREATE FUNCTION trg_payment_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    balance NUMERIC;
BEGIN
    UPDATE installments
       SET amount_paid = amount_paid + NEW.amount
     WHERE installment_id = NEW.installment_id
       AND amount_paid + NEW.amount <= amount_due;

    IF NOT FOUND THEN
        SELECT amount_due - amount_paid INTO balance
          FROM installments WHERE installment_id = NEW.installment_id;
        RAISE EXCEPTION 'Payment of % exceeds the balance due (%)', NEW.amount, COALESCE(balance, 0);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER payment_after_insert
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION trg_payment_after_insert();

-- T6. Generic audit trigger (uses TG_TABLE_NAME / TG_OP and JSONB)
CREATE FUNCTION trg_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (table_name, operation, row_data)
    VALUES (TG_TABLE_NAME, TG_OP,
            CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
    RETURN NULL;
END $$;

CREATE TRIGGER audit_members     AFTER INSERT OR UPDATE OR DELETE ON members     FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_chit_groups AFTER INSERT OR UPDATE OR DELETE ON chit_groups FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_auctions    AFTER INSERT OR UPDATE OR DELETE ON auctions    FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_enrollments AFTER INSERT OR UPDATE OR DELETE ON enrollments FOR EACH ROW EXECUTE FUNCTION trg_audit();
CREATE TRIGGER audit_payments    AFTER INSERT OR UPDATE OR DELETE ON payments    FOR EACH ROW EXECUTE FUNCTION trg_audit();

-- =====================================================================
--  VIEWS (reports)
-- =====================================================================

-- V1. One row per group with progress and money totals
CREATE VIEW v_group_summary AS
SELECT g.group_id, g.group_name, g.chit_value, g.total_members, g.monthly_contribution,
       g.commission_pct, g.max_bid_pct, g.start_date, g.status,
       (SELECT count(*)::int FROM enrollments e WHERE e.group_id = g.group_id) AS enrolled,
       (SELECT count(*)::int FROM auctions a    WHERE a.group_id = g.group_id) AS auctions_done,
       COALESCE(t.collected, 0)   AS total_collected,
       COALESCE(t.outstanding, 0) AS total_outstanding
  FROM chit_groups g
  LEFT JOIN (
        SELECT e.group_id,
               sum(i.amount_paid)                AS collected,
               sum(i.amount_due - i.amount_paid) AS outstanding
          FROM installments i
          JOIN enrollments e USING (enrollment_id)
         GROUP BY e.group_id
       ) t ON t.group_id = g.group_id;

-- V2. One row per member with dues across all groups
CREATE VIEW v_member_dues AS
SELECT m.member_id, m.full_name, m.phone, m.email, m.joined_on,
       count(DISTINCT e.group_id)::int                       AS groups_joined,
       COALESCE(sum(i.amount_paid), 0)                       AS total_paid,
       COALESCE(sum(i.amount_due - i.amount_paid), 0)        AS total_outstanding,
       EXISTS (SELECT 1 FROM auctions a JOIN enrollments e2 ON e2.enrollment_id = a.winner_enrollment_id
                WHERE e2.member_id = m.member_id)            AS has_won
  FROM members m
  LEFT JOIN enrollments  e ON e.member_id = m.member_id
  LEFT JOIN installments i ON i.enrollment_id = e.enrollment_id
 GROUP BY m.member_id;

-- V3. Overdue installments (defaulters report)
CREATE VIEW v_defaulters AS
SELECT i.installment_id, m.member_id, m.full_name, m.phone,
       g.group_id, g.group_name, e.ticket_no, i.month_no, i.due_date,
       i.amount_due, i.amount_paid, (i.amount_due - i.amount_paid) AS balance,
       (CURRENT_DATE - i.due_date) AS days_overdue
  FROM installments i
  JOIN enrollments  e ON e.enrollment_id = i.enrollment_id
  JOIN members      m ON m.member_id     = e.member_id
  JOIN chit_groups  g ON g.group_id      = e.group_id
 WHERE i.status <> 'paid' AND i.due_date < CURRENT_DATE;

-- =====================================================================
--  FUNCTIONS (stored procedures)
-- =====================================================================

-- F1. Full statement for one member (table-returning function)
CREATE FUNCTION fn_member_statement(p_member_id INT)
RETURNS TABLE (installment_id INT, group_name VARCHAR, ticket_no SMALLINT, month_no SMALLINT,
               due_date DATE, amount_due NUMERIC, amount_paid NUMERIC, balance NUMERIC, status VARCHAR)
LANGUAGE sql STABLE AS $$
    SELECT i.installment_id, g.group_name, e.ticket_no, i.month_no, i.due_date,
           i.amount_due, i.amount_paid, i.amount_due - i.amount_paid, i.status
      FROM installments i
      JOIN enrollments  e ON e.enrollment_id = i.enrollment_id
      JOIN chit_groups  g ON g.group_id      = e.group_id
     WHERE e.member_id = p_member_id
     ORDER BY g.group_name, i.month_no;
$$;

-- F2. Preview what an auction bid would mean, without saving it
CREATE FUNCTION fn_auction_preview(p_group_id INT, p_discount NUMERIC)
RETURNS TABLE (commission NUMERIC, dividend_per_member NUMERIC, payout_amount NUMERIC, member_pays NUMERIC)
LANGUAGE sql STABLE AS $$
    SELECT round(g.chit_value * g.commission_pct / 100, 2),
           round((p_discount - g.chit_value * g.commission_pct / 100) / g.total_members, 2),
           g.chit_value - p_discount,
           g.monthly_contribution - round((p_discount - g.chit_value * g.commission_pct / 100) / g.total_members, 2)
      FROM chit_groups g WHERE g.group_id = p_group_id;
$$;
