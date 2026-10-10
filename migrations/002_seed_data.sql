-- 002_seed_data.sql
-- Seed 5 SKUs with image URLs, 2 job-workers and 4 open issues.
-- Repeatable without creating duplicates.

INSERT INTO skus (id, code, name, image_url) VALUES
('a0000000-0000-0000-0000-000000000001', 'SKU-KURTI-001', 'Anarkali Embroidered Kurti (Crimson Red)', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80'),
('a0000000-0000-0000-0000-000000000002', 'SKU-LEH-002', 'Zardozi Bridal Lehenga (Royal Maroon)', 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80'),
('a0000000-0000-0000-0000-000000000003', 'SKU-DUP-003', 'Banarasi Silk Dupatta (Mustard Gold)', 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80'),
('a0000000-0000-0000-0000-000000000004', 'SKU-SUIT-004', 'Chanderi Handloom Suit Set (Emerald Green)', 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=600&q=80'),
('a0000000-0000-0000-0000-000000000005', 'SKU-SAREE-005', 'Chikankari Georgette Saree (Blush Pink)', 'https://images.unsplash.com/photo-1610030469668-93510cb2866c?auto=format&fit=crop&w=600&q=80')
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    image_url = EXCLUDED.image_url;

INSERT INTO parties (id, name, phone) VALUES
('b0000000-0000-0000-0000-000000000001', 'Rafiq Embroidery Works', '+91 9811122334'),
('b0000000-0000-0000-0000-000000000002', 'Laxmi Stitching & Tailoring Unit', '+91 9822233445')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

INSERT INTO jobwork_issues (id, party_id, sku_id, qty, issued_on) VALUES
('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 50, '2026-10-01'),
('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 20, '2026-10-03'),
('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 40, '2026-10-05'),
('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 100, '2026-10-08')
ON CONFLICT (id) DO UPDATE SET
    party_id = EXCLUDED.party_id,
    sku_id = EXCLUDED.sku_id,
    qty = EXCLUDED.qty,
    issued_on = EXCLUDED.issued_on;
