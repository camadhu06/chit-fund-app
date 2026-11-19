-- =====================================================================
--  ChitBook — sample data
--  Notice: we only insert members, groups, enrollments, auctions and
--  payments. Ticket numbers, group status, commission, dividends,
--  installments and audit rows are all produced by the TRIGGERS.
-- =====================================================================

INSERT INTO members (full_name, phone, email, address, joined_on) VALUES
 ('Aarav Sharma',     '9876500001', 'aarav@example.com',   'Indiranagar, Bengaluru', '2026-04-02'),
 ('Diya Patel',       '9876500002', 'diya@example.com',    'Navrangpura, Ahmedabad', '2026-04-05'),
 ('Rohan Iyer',       '9876500003', 'rohan@example.com',   'Adyar, Chennai',         '2026-04-11'),
 ('Ananya Reddy',     '9876500004', 'ananya@example.com',  'Banjara Hills, Hyderabad','2026-04-15'),
 ('Vikram Singh',     '9876500005', NULL,                  'Sector 15, Chandigarh',  '2026-04-20'),
 ('Meera Nair',       '9876500006', 'meera@example.com',   'Kakkanad, Kochi',        '2026-04-22'),
 ('Kabir Khan',       '9876500007', 'kabir@example.com',   'Bandra, Mumbai',         '2026-05-01'),
 ('Ishita Banerjee',  '9876500008', 'ishita@example.com',  'Salt Lake, Kolkata',     '2026-05-03'),
 ('Arjun Menon',      '9876500009', NULL,                  'Kowdiar, Trivandrum',    '2026-05-09'),
 ('Sneha Kulkarni',   '9876500010', 'sneha@example.com',   'Kothrud, Pune',          '2026-05-12'),
 ('Farhan Qureshi',   '9876500011', 'farhan@example.com',  'Hazratganj, Lucknow',    '2026-08-18'),
 ('Lakshmi Rao',      '9876500012', 'lakshmi@example.com', 'Jayanagar, Bengaluru',   '2026-09-01'),
 ('Neha Gupta',       '9876500013', 'neha@example.com',    'Malviya Nagar, Jaipur',  '2026-09-07'),
 ('Siddharth Das',    '9876500014', NULL,                  'Saheed Nagar, Bhubaneswar','2026-10-14');

INSERT INTO chit_groups (group_name, chit_value, total_members, commission_pct, max_bid_pct, start_date) VALUES
 ('Diwali Savers ₹1L',  100000, 10, 5, 40, '2026-06-01'),
 ('Small Saver ₹50K',    50000, 10, 5, 30, '2026-12-01'),
 ('Business Boost ₹5L', 500000, 20, 5, 40, '2027-01-01');

-- Group 1: fully enrolled (members 1–10) -> trigger flips it to ACTIVE
INSERT INTO enrollments (group_id, member_id, enrolled_on)
SELECT 1, member_id, DATE '2026-05-25' FROM members WHERE member_id <= 10 ORDER BY member_id;

-- Group 2: partially enrolled -> stays OPEN
INSERT INTO enrollments (group_id, member_id, enrolled_on)
SELECT 2, member_id, DATE '2026-10-20' FROM members WHERE member_id IN (2, 4, 7, 11, 12, 13) ORDER BY member_id;

-- Group 3: a few early sign-ups
INSERT INTO enrollments (group_id, member_id, enrolled_on)
SELECT 3, member_id, DATE '2026-11-05' FROM members WHERE member_id IN (1, 5, 14) ORDER BY member_id;

-- Six monthly auctions for group 1 (Jun–Nov 2026).
-- Discounts shrink over time, as they do in real chits.
INSERT INTO auctions (group_id, month_no, auction_date, winner_enrollment_id, bid_discount) VALUES
 (1, 1, '2026-06-01', (SELECT enrollment_id FROM enrollments WHERE group_id = 1 AND ticket_no = 4), 32000),
 (1, 2, '2026-07-01', (SELECT enrollment_id FROM enrollments WHERE group_id = 1 AND ticket_no = 7), 27500),
 (1, 3, '2026-08-01', (SELECT enrollment_id FROM enrollments WHERE group_id = 1 AND ticket_no = 1), 22000),
 (1, 4, '2026-09-01', (SELECT enrollment_id FROM enrollments WHERE group_id = 1 AND ticket_no = 9), 18000),
 (1, 5, '2026-10-01', (SELECT enrollment_id FROM enrollments WHERE group_id = 1 AND ticket_no = 2), 14500),
 (1, 6, '2026-11-01', (SELECT enrollment_id FROM enrollments WHERE group_id = 1 AND ticket_no = 5), 11000);

-- Payments: months 1–4 fully paid, except a couple of late payers.
INSERT INTO payments (installment_id, amount, mode, reference_no, paid_on)
SELECT i.installment_id, i.amount_due,
       (ARRAY['cash','upi','bank_transfer','upi']::payment_mode[])[1 + (i.installment_id % 4)],
       CASE WHEN i.installment_id % 4 = 0 THEN NULL ELSE 'TXN' || lpad(i.installment_id::text, 6, '0') END,
       i.due_date - (i.installment_id % 6) + TIME '11:00'
  FROM installments i
  JOIN enrollments e USING (enrollment_id)
 WHERE i.month_no <= 4
   AND NOT (e.ticket_no = 6 AND i.month_no = 4)
   AND NOT (e.ticket_no = 8 AND i.month_no IN (3, 4));

-- Month 5: most paid, ticket 8 still defaulting, ticket 3 paid half.
INSERT INTO payments (installment_id, amount, mode, reference_no, paid_on)
SELECT i.installment_id,
       CASE WHEN e.ticket_no = 3 THEN round(i.amount_due / 2, 2) ELSE i.amount_due END,
       'upi', 'UPI' || lpad(i.installment_id::text, 6, '0'),
       i.due_date - 2 + TIME '18:30'
  FROM installments i
  JOIN enrollments e USING (enrollment_id)
 WHERE i.month_no = 5 AND e.ticket_no NOT IN (8, 6);

-- Month 6: only some members have paid so far.
INSERT INTO payments (installment_id, amount, mode, reference_no, paid_on)
SELECT i.installment_id, i.amount_due, 'cash', NULL, i.due_date - 3 + TIME '10:15'
  FROM installments i
  JOIN enrollments e USING (enrollment_id)
 WHERE i.month_no = 6 AND e.ticket_no IN (1, 2, 4, 5, 7, 9);
