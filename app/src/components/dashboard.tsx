"use client";

import { useMemo, useState } from "react";
import { ConversionAdvisor } from "@/components/conversion-advisor";
import { InventoryMutationDialog, type InventoryItem } from "@/components/inventory-mutation";

type IconName =
  | "home"
  | "stock"
  | "convert"
  | "orders"
  | "models"
  | "reports"
  | "settings"
  | "scan"
  | "plus"
  | "minus"
  | "alert"
  | "arrow";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    stock: <><path d="M4 7h16v13H4z"/><path d="m7 7 1.5-4h7L17 7M8 11h8"/></>,
    convert: <><path d="M5 7h12l-3-3M19 17H7l3 3"/><path d="m17 7 2 2-2 2M7 17l-2-2 2-2"/></>,
    orders: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    models: <><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6A8 8 0 0 0 8.8 7L6.5 6.1l-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1A8 8 0 0 0 10.4 18l.3 2.6h4L15 18a8 8 0 0 0 1.6-1l2.3 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.1Z"/></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M7 12h10M9 9v6M12 9v6M15 9v6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    alert: <><path d="M12 3 2.8 20h18.4Z"/><path d="M12 9v5M12 17h.01"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const navItems: { label: string; icon: IconName; active?: boolean }[] = [
  { label: "Overzicht", icon: "home", active: true },
  { label: "Voorraad", icon: "stock" },
  { label: "Conversies", icon: "convert" },
  { label: "Bestellingen", icon: "orders" },
  { label: "Modellen", icon: "models" },
  { label: "Rapportages", icon: "reports" },
];

const initialLowStock: InventoryItem[] = [
  { model: "Fujitsu Lifebook U7410", sku: "NB10210E1NL", layout: "QWERTY US", stock: 0, threshold: 10 },
  { model: "HP 240 G8", sku: "NB10200E2NL", layout: "QWERTY US", stock: 2, threshold: 10 },
  { model: "HP ZBook 15 G3", sku: "NB10043E1DE", layout: "QWERTZ DE", stock: 4, threshold: 10 },
  { model: "Dell Latitude 7300", sku: "NB10060E1NL", layout: "QWERTY US", stock: 5, threshold: 10 },
];

const methods = [
  { id: 1, name: "Losse stickers", detail: "Wordt uitgefaseerd", tone: "muted", status: "Fallback" },
  { id: 2, name: "Noviply voorraadvel", detail: "Onder €300 · vooral QWERTY US", tone: "blue", status: "148 SKU’s" },
  { id: 3, name: "Sterke printsticker", detail: "Buitenlandse layouts · onder €300", tone: "violet", status: "Actief" },
  { id: 4, name: "Directe keyboardprint", detail: "Vanaf €300 · premium resultaat", tone: "green", status: "Voorkeur" },
];

export function Dashboard() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [stockItems, setStockItems] = useState(initialLowStock);
  const [mutation, setMutation] = useState<{ mode: "issue" | "receipt"; item: InventoryItem } | null>(null);
  const [lastAction, setLastAction] = useState("");
  const filteredStock = useMemo(
    () => stockItems.filter((item) => `${item.model} ${item.sku} ${item.layout}`.toLowerCase().includes(query.toLowerCase())),
    [query, stockItems],
  );
  const defaultItem = stockItems.find((item) => item.stock > 0) ?? stockItems[0];

  function saveMutation(newQuantity: number, quantityDelta: number) {
    if (!mutation) return;
    setStockItems((items) => items.map((item) => item.sku === mutation.item.sku ? { ...item, stock: newQuantity } : item));
    setLastAction(`${mutation.item.sku}: ${quantityDelta > 0 ? "+" : ""}${quantityDelta} geboekt · nieuwe voorraad ${newQuantity}`);
    setMutation(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div><strong>KeyFlow</strong><span>Keyboard Operations</span></div>
        </div>
        <nav aria-label="Hoofdnavigatie">
          {navItems.map((item) => (
            <button key={item.label} className={`nav-item ${item.active ? "active" : ""}`}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item"><Icon name="settings" /><span>Instellingen</span></button>
          <div className="profile">
            <div className="avatar">TB</div>
            <div><strong>Tim Beek</strong><span>Beheerder</span></div>
            <button aria-label="Profielmenu">•••</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">MAANDAG 27 JULI</p>
            <h1>Goedemiddag, Tim</h1>
            <p>Dit vraagt vandaag je aandacht.</p>
          </div>
          <div className="top-actions">
            <label className="global-search">
              <span className="sr-only">Zoeken</span>
              <Icon name="scan" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scan of zoek model, SKU…" />
              <kbd>/</kbd>
            </label>
            <button className="icon-button" aria-label="Meldingen"><Icon name="alert" /><span className="notification-dot" /></button>
          </div>
        </header>

        <section className="quick-actions" aria-label="Snelle acties">
          <button className="action-card issue" onClick={() => setMutation({ mode: "issue", item: defaultItem })}>
            <span className="action-icon"><Icon name="minus" size={26} /></span>
            <span><strong>Snel afboeken</strong><small>Scan SKU en boek direct −1</small></span>
            <Icon name="arrow" />
          </button>
          <button className="action-card receive" onClick={() => setMutation({ mode: "receipt", item: defaultItem })}>
            <span className="action-icon"><Icon name="plus" size={26} /></span>
            <span><strong>Voorraad ontvangen</strong><small>Levering of retour registreren</small></span>
            <Icon name="arrow" />
          </button>
          <button className="action-card conversion" onClick={() => setAdvisorOpen(true)}>
            <span className="action-icon"><Icon name="convert" size={26} /></span>
            <span><strong>Nieuwe conversie</strong><small>Vind de beste methode voor een laptop</small></span>
            <Icon name="arrow" />
          </button>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div><span>Totale voorraad</span><strong>3.218</strong><small>stickervellen op 2 locaties</small></div>
            <div className="stat-glyph stock"><Icon name="stock" size={27} /></div>
          </article>
          <article className="stat-card urgent">
            <div><span>Lage voorraad</span><strong>15</strong><small><b>3 kritiek</b> · directe actie nodig</small></div>
            <div className="stat-glyph"><Icon name="alert" size={27} /></div>
          </article>
          <article className="stat-card">
            <div><span>Vandaag verbruikt</span><strong>—</strong><small>Start met transactieregistratie</small></div>
            <div className="stat-glyph chart"><Icon name="reports" size={27} /></div>
          </article>
          <article className="stat-card">
            <div><span>Open conversies</span><strong>0</strong><small>Geen wachtrij geregistreerd</small></div>
            <div className="stat-glyph convert"><Icon name="convert" size={27} /></div>
          </article>
        </section>

        <div className="content-grid">
          <section className="panel stock-panel">
            <div className="panel-heading">
              <div><h2>Voorraad vraagt aandacht</h2><p>Gesorteerd op urgentie</p></div>
              <button>Bekijk alle 15 <Icon name="arrow" size={16} /></button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Model / SKU</th><th>Layout</th><th>Voorraad</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredStock.map((item) => (
                    <tr key={item.sku}>
                      <td><strong>{item.model}</strong><span>{item.sku}</span></td>
                      <td><span className="layout-badge">{item.layout}</span></td>
                      <td><b className={item.stock === 0 ? "zero" : ""}>{item.stock}</b><span> / min. {item.threshold}</span></td>
                      <td><span className={`status ${item.stock === 0 ? "critical" : "low"}`}>{item.stock === 0 ? "Uitverkocht" : "Laag"}</span></td>
                      <td><button className="row-action" onClick={() => setMutation({ mode: "receipt", item })}>Voorraad</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStock.length === 0 && <div className="empty">Geen aandachtspunten gevonden voor “{query}”.</div>}
            </div>
          </section>

          <section className="panel methods-panel">
            <div className="panel-heading">
              <div><h2>Conversiemethoden</h2><p>Huidige voorkeursvolgorde</p></div>
              <button className="more-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>•••</button>
            </div>
            <div className="method-list">
              {methods.map((method) => (
                <button className="method" key={method.id}>
                  <span className={`method-number ${method.tone}`}>{method.id}</span>
                  <span><strong>{method.name}</strong><small>{method.detail}</small></span>
                  <span className={`method-status ${method.tone}`}>{method.status}</span>
                </button>
              ))}
            </div>
            <div className="policy-note">
              <span><Icon name="alert" size={18} /></span>
              <p><strong>Actieve beleidsregel</strong>De grens van €300 is instelbaar. Drukte en beschikbaarheid kunnen een gemotiveerde afwijking toestaan.</p>
            </div>
          </section>
        </div>

        <footer className="app-footer">
          <span><i /> Systeem gereed</span>
          <span>{lastAction || "Prototype met geverifieerde Excel-momentopname"}</span>
        </footer>
        <ConversionAdvisor open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
        {mutation && (
          <InventoryMutationDialog
            open
            mode={mutation.mode}
            item={mutation.item}
            onClose={() => setMutation(null)}
            onConfirm={saveMutation}
          />
        )}
      </main>
    </div>
  );
}
