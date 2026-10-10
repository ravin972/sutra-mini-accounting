'use client';

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Shirt, 
  Scissors, 
  Tag, 
  ExternalLink, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  Layers,
  ChevronRight
} from 'lucide-react';
import { IssueSummary } from '../types';

interface SKUDetail {
  code: string;
  name: string;
  category: string;
  fabric: string;
  rateINR: number;
  image_url: string;
  description: string;
}

const STATIC_SKU_CATALOG: SKUDetail[] = [
  {
    code: 'SKU-KURTI-001',
    name: 'Anarkali Embroidered Kurti (Crimson Red)',
    category: 'Kurtis',
    fabric: '60s Chanderi Cotton, Zari & Thread embroidery',
    rateINR: 650,
    image_url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80',
    description: 'Flared royal Anarkali silhouette with intricate zardozi collar embroidery and kali borders crafted for festive wear.',
  },
  {
    code: 'SKU-LEH-002',
    name: 'Zardozi Bridal Lehenga (Royal Maroon)',
    category: 'Lehengas',
    fabric: 'Pure Silk Velvet with Handcrafted Dabka & Zardozi',
    rateINR: 1850,
    image_url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
    description: 'Heavy bridal lehenga skirt featuring floral motifs in genuine dabka, cutdana, and golden tilla embroidery.',
  },
  {
    code: 'SKU-DUP-003',
    name: 'Banarasi Silk Dupatta (Mustard Gold)',
    category: 'Dupattas',
    fabric: 'Handloom Katan Silk with Kadwa Floral Jaal',
    rateINR: 420,
    image_url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80',
    description: 'Traditional Banarasi weave with golden zari pallu and meenakari highlights from Varanasi master weavers.',
  },
  {
    code: 'SKU-SUIT-004',
    name: 'Chanderi Handloom Suit Set (Emerald Green)',
    category: 'Suits',
    fabric: 'Pure Chanderi Silk Cotton with Gota Patti',
    rateINR: 890,
    image_url: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80',
    description: 'Elegant 3-piece unstitched festive suit with hand-beaten gotta patti yoke and handloom organza border dupatta.',
  },
  {
    code: 'SKU-SAR-005',
    name: 'Lucknowi Chikankari Saree (Ivory Pearl)',
    category: 'Sarees',
    fabric: 'Hand-dyed Pure Georgette with Bakhiya & Mukaish',
    rateINR: 1150,
    image_url: 'https://images.unsplash.com/photo-1610030469668-93510cb07fe6?auto=format&fit=crop&w=800&q=80',
    description: 'Exquisite shadow-work Chikankari drape hand-stitched by Awadh artisans with silver mukaish badla embellishments.',
  },
];

interface ProductsCatalogViewProps {
  issues: IssueSummary[];
  onIssueReceipt: (issueId: string) => void;
}

export const ProductsCatalogView: React.FC<ProductsCatalogViewProps> = ({
  issues,
  onIssueReceipt,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Kurtis', 'Lehengas', 'Dupattas', 'Suits', 'Sarees'];

  // Match issues to SKUs
  const catalogWithIssues = useMemo(() => {
    return STATIC_SKU_CATALOG.map((sku) => {
      // Find all issues matching this SKU
      const matchingIssues = issues.filter(
        (i) => i.sku_code.toLowerCase() === sku.code.toLowerCase() ||
               i.sku_name.toLowerCase().includes(sku.category.toLowerCase().slice(0, -1))
      );

      const totalIssued = matchingIssues.reduce((sum, i) => sum + i.issued_qty, 0);
      const totalReceived = matchingIssues.reduce((sum, i) => sum + i.total_received_qty, 0);
      const totalOutstanding = matchingIssues.reduce((sum, i) => sum + i.outstanding_qty, 0);

      return {
        ...sku,
        issues: matchingIssues,
        totalIssued,
        totalReceived,
        totalOutstanding,
      };
    });
  }, [issues]);

  const filtered = useMemo(() => {
    return catalogWithIssues.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || 
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.fabric.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [catalogWithIssues, selectedCategory, search]);

  const totalOutstandingAll = issues.reduce((acc, i) => acc + i.outstanding_qty, 0);
  const totalIssuedAll = issues.reduce((acc, i) => acc + i.issued_qty, 0);

  return (
    <div className="catalog-wrapper">
      {/* Product Banner / KPI Header */}
      <div className="catalog-header-bar">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Ethnicwear Garment Portfolio</span>
            <span className="ent-badge-pill" style={{ background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--border-default)', fontSize: '0.72rem' }}>
              Shree Radha Studio Manufacturing
            </span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Production SKUs dispatched to Gandhi Nagar job-workers for embroidery, zardozi, and tailoring.
          </p>
        </div>

        <div className="catalog-quick-stats">
          <div className="catalog-stat-chip">
            <span className="stat-label">Active SKUs</span>
            <span className="stat-val">5 Styles</span>
          </div>
          <div className="catalog-stat-chip">
            <span className="stat-label">With Artisans</span>
            <span className="stat-val" style={{ color: '#38bdf8' }}>{totalOutstandingAll} pcs</span>
          </div>
          <div className="catalog-stat-chip">
            <span className="stat-label">Total Dispatched</span>
            <span className="stat-val">{totalIssuedAll} pcs</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="catalog-toolbar">
        <div className="ent-search-wrapper" style={{ flex: 1, maxWidth: '340px' }}>
          <Search 
            size={14} 
            style={{ 
              position: 'absolute', 
              left: '10px', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: 'var(--text-tertiary)' 
            }} 
          />
          <input
            type="text"
            className="ent-search-input"
            placeholder="Search SKU code, fabric, or style..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="category-pill-group">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-pill-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="catalog-grid">
        {filtered.map((item) => {
          const firstOpenIssue = item.issues.find((i) => i.outstanding_qty > 0) || item.issues[0];
          const pct = item.totalIssued > 0 
            ? Math.round(Math.min(100, (item.totalReceived / item.totalIssued) * 100))
            : 0;

          return (
            <div key={item.code} className="catalog-card">
              {/* Product Image */}
              <div className="catalog-img-container">
                <img 
                  src={item.image_url} 
                  alt={item.name} 
                  className="catalog-img"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.opacity = '0.5';
                  }}
                />
                <div className="catalog-img-badges">
                  <span className="catalog-code-pill">{item.code}</span>
                  <span className="catalog-category-pill">{item.category}</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="catalog-card-body">
                <h3 className="catalog-item-title">{item.name}</h3>
                <p className="catalog-item-desc">{item.description}</p>

                <div className="catalog-item-spec">
                  <span style={{ color: 'var(--text-tertiary)' }}>Fabric:</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{item.fabric}</span>
                </div>

                <div className="catalog-item-spec">
                  <span style={{ color: 'var(--text-tertiary)' }}>Jobwork Rate:</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, color: 'var(--text-primary)' }}>
                    ₹{item.rateINR.toLocaleString('en-IN')} / pc
                  </span>
                </div>

                {/* Artisan Allocation Section */}
                <div className="catalog-batch-status">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Artisan Batches:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.issues.length > 0 
                        ? `${item.issues.length} active batch${item.issues.length > 1 ? 'es' : ''}` 
                        : 'No open batches'}
                    </span>
                  </div>

                  {item.issues.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                        <span>Progress: {item.totalReceived} / {item.totalIssued} pcs</span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div className="catalog-progress-track">
                        <div 
                          className="catalog-progress-fill" 
                          style={{ 
                            width: `${pct}%`,
                            background: pct === 100 ? 'var(--status-success)' : 'var(--accent-primary)'
                          }} 
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                    {item.issues.map((i) => (
                      <span 
                        key={i.id} 
                        className="artisan-mini-chip"
                        title={`${i.party_name}: ${i.outstanding_qty} pcs outstanding`}
                      >
                        <Scissors size={10} />
                        <span>{i.party_name.split(' ')[0]} ({i.outstanding_qty} left)</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Action */}
                <div className="catalog-card-footer">
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}
                    onClick={() => {
                      if (firstOpenIssue) {
                        onIssueReceipt(firstOpenIssue.id);
                      } else {
                        onIssueReceipt('');
                      }
                    }}
                  >
                    <Plus size={13} />
                    <span>Record Receipt for {item.category}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
