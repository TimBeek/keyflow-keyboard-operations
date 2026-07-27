"use client";

import { useMemo, useState } from "react";
import { ConversionAdvisor } from "@/components/conversion-advisor";
import { AccessManagementDialog } from "@/components/access-management";
import { EmployeeWorkspace } from "@/components/employee-workspace";
import { ImportReviewDialog } from "@/components/import-review";
import { InventoryImportDialog } from "@/components/inventory-import";
import { InventoryCatalog } from "@/components/inventory-catalog";
import { InventoryMutationDialog, type InventoryItem } from "@/components/inventory-mutation";
import { OperationsManagement } from "@/components/operations-management";
import {
  ConversionsWorkspace,
  ModelsWorkspace,
  OrdersWorkspace,
  ReportsWorkspace,
} from "@/components/planning-workspaces";
import { inventoryCatalog } from "@/data/inventory-demo";
import { initialInventoryTransactions } from "@/data/operations-demo";
import type { UserRole } from "@/domain/access-control";
import { calculateInventoryMutation } from "@/domain/inventory";
import {
  defaultOperationsPolicy,
  type InventoryMutationRequest,
  type InventoryTransactionEntry,
  type OperationsPolicy,
} from "@/domain/operations";

type IconName =
  | "home"
  | "stock"
  | "convert"
  | "orders"
  | "models"
  | "reports"
  | "settings"
  | "scan"
  | "upload"
  | "plus"
  | "minus"
  | "alert"
  | "arrow";

type ViewName = "overview" | "inventory" | "conversions" | "orders" | "models" | "operations" | "reports";

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
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 14v6h16v-6"/></>,
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

const navItems: { id: ViewName; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overzicht", icon: "home" },
  { id: "inventory", label: "Voorraad", icon: "stock" },
  { id: "conversions", label: "Conversies", icon: "convert" },
  { id: "orders", label: "Bestellingen", icon: "orders" },
  { id: "models", label: "Modellen", icon: "models" },
  { id: "operations", label: "Beheer & analyse", icon: "settings" },
  { id: "reports", label: "Rapportages", icon: "reports" },
];

const viewHeadings: Record<ViewName, { title: string; subtitle: string }> = {
  overview: { title: "Goedemiddag, Tim", subtitle: "Dit vraagt vandaag je aandacht." },
  inventory: { title: "Voorraad", subtitle: "Zoek, controleer en plan alle keyboardstickers." },
  conversions: { title: "Conversies", subtitle: "Beheer de methode en voortgang per laptoporder." },
  orders: { title: "Bestellingen", subtitle: "Zet automatisch voorraadadvies om in een gecontroleerd concept." },
  models: { title: "Modellen", subtitle: "Beheer compatibiliteit zonder dubbele handmatige invoer." },
  operations: { title: "Beheer & analyse", subtitle: "Configureer uitvoering en analyseer iedere voorraadbeweging." },
  reports: { title: "Rapportages", subtitle: "Volg verbruik, dekking, trends en komende behoefte." },
};

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
  const [role, setRole] = useState<UserRole>("management");
  const [activeView, setActiveView] = useState<ViewName>("overview");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null);
  const [stockItems, setStockItems] = useState(initialLowStock);
  const [catalogQuantities, setCatalogQuantities] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<InventoryTransactionEntry[]>(initialInventoryTransactions);
  const [operationsPolicy, setOperationsPolicy] = useState<OperationsPolicy>(defaultOperationsPolicy);
  const [mutation, setMutation] = useState<{
    mode: "issue" | "receipt";
    item: InventoryItem;
    onConfirm?: (newQuantity: number) => void;
  } | null>(null);
  const [lastAction, setLastAction] = useState("");
  const filteredStock = useMemo(
    () => stockItems.filter((item) => `${item.model} ${item.sku} ${item.layout}`.toLowerCase().includes(query.toLowerCase())),
    [query, stockItems],
  );
  const defaultItem = stockItems.find((item) => item.stock > 0) ?? stockItems[0];
  const todayIssued = transactions
    .filter((entry) => entry.occurredAt.startsWith("2026-07-27") && entry.quantityDelta < 0)
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);

  function saveMutation(newQuantity: number, quantityDelta: number) {
    if (!mutation) return;
    if (mutation.onConfirm) mutation.onConfirm(newQuantity);
    else setStockItems((items) => items.map((item) => item.sku === mutation.item.sku ? { ...item, stock: newQuantity } : item));
    setTransactions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        sku: mutation.item.sku,
        model: mutation.item.model,
        layout: mutation.item.layout,
        type: quantityDelta > 0 ? "receipt" : "issue",
        quantityDelta,
        reasonCode: quantityDelta > 0 ? "supplier_delivery" : "manual_issue",
        actor: "Tim Beek",
        reference: "Managementboeking",
      },
    ]);
    setLastAction(`${mutation.item.sku}: ${quantityDelta > 0 ? "+" : ""}${quantityDelta} geboekt · nieuwe voorraad ${newQuantity}`);
    setMutation(null);
  }

  function recordEmployeeInventoryMutation(request: InventoryMutationRequest) {
    const item = inventoryCatalog.find((candidate) => candidate.sku === request.sku);
    if (!item) throw new Error(`Onbekend sticker-SKU: ${request.sku}.`);
    const currentQuantity = catalogQuantities[item.sku] ?? item.stock;
    const result = calculateInventoryMutation({
      sku: request.sku,
      currentQuantity,
      type: request.type,
      quantity: request.quantity,
      reasonCode: request.reasonCode,
      notes: request.notes,
      idempotencyKey: `employee-${crypto.randomUUID()}`,
    });
    setCatalogQuantities((current) => ({ ...current, [item.sku]: result.newQuantity }));
    setStockItems((items) => items.map((stockItem) => stockItem.sku === item.sku ? { ...stockItem, stock: result.newQuantity } : stockItem));
    setTransactions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        sku: item.sku,
        model: item.model,
        layout: item.layout,
        type: request.type,
        quantityDelta: result.quantityDelta,
        reasonCode: request.reasonCode,
        notes: request.notes,
        actor: request.actor,
        reference: request.reference,
      },
    ]);
    setLastAction(`${item.sku}: ${result.quantityDelta > 0 ? "+" : ""}${result.quantityDelta} door ${request.actor} · voorraad ${result.newQuantity}`);
    return result;
  }

  function switchRole(nextRole: UserRole) {
    setRole(nextRole);
    setActiveView("overview");
    setQuery("");
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
          {(role === "management" ? navItems : [{ id: "overview" as const, label: "Uitvoering", icon: "convert" as const }]).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => setActiveView(item.id)}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => role === "management" && setAccessOpen(true)}><Icon name="settings" /><span>{role === "management" ? "Toegangsbeheer" : "Hulp"}</span></button>
          <div className="profile">
            <div className="avatar">{role === "management" ? "TB" : "MW"}</div>
            <div><strong>{role === "management" ? "Tim Beek" : "Medewerker"}</strong><span>{role === "management" ? "Management" : "Uitvoering"}</span></div>
            <button aria-label="Profielmenu">•••</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">MAANDAG 27 JULI</p>
            <h1>{role === "employee" ? "Uitvoering keyboardconversies" : viewHeadings[activeView].title}</h1>
            <p>{role === "employee" ? "Eén duidelijke taak tegelijk, met automatisch methodeadvies." : viewHeadings[activeView].subtitle}</p>
          </div>
          <div className="top-actions">
            <div className="role-switcher" aria-label="Demorol kiezen">
              <span>TOEGANG</span>
              <div>
                <button className={role === "employee" ? "active" : ""} onClick={() => switchRole("employee")}>Werknemer</button>
                <button className={role === "management" ? "active" : ""} onClick={() => switchRole("management")}>Management</button>
              </div>
            </div>
            {role === "management" && <label className="global-search">
              <span className="sr-only">Zoeken</span>
              <Icon name="scan" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => activeView !== "inventory" && setActiveView("inventory")}
                placeholder="Scan of zoek model, SKU…"
              />
              <kbd>/</kbd>
            </label>}
            <button className="icon-button" aria-label="Meldingen"><Icon name="alert" /><span className="notification-dot" /></button>
          </div>
        </header>

        {role === "employee" && (
          <EmployeeWorkspace
            catalog={inventoryCatalog}
            quantities={catalogQuantities}
            policy={operationsPolicy}
            onInventoryMutation={recordEmployeeInventoryMutation}
          />
        )}

        {role === "management" && activeView === "overview" && (
          <>
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
          <button className="action-card import" onClick={() => setImportOpen(true)}>
            <span className="action-icon"><Icon name="upload" size={26} /></span>
            <span><strong>Excel importeren</strong><small>Controleer voorraad zonder direct te boeken</small></span>
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
            <div><span>Vandaag verbruikt</span><strong>{todayIssued}</strong><small>automatisch en handmatig afgeboekt</small></div>
            <div className="stat-glyph chart"><Icon name="reports" size={27} /></div>
          </article>
          <article className="stat-card">
            <div><span>Open conversies</span><strong>3</strong><small>1 wacht op kwaliteitscontrole</small></div>
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
              <button className="more-button" onClick={() => { setMenuOpen(!menuOpen); setActiveView("operations"); }} aria-expanded={menuOpen}>•••</button>
            </div>
            <div className="method-list">
              {methods.map((method) => (
                <button className="method" key={method.id} onClick={() => setActiveView("operations")}>
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
        <section className="roadmap-panel">
          <div className="roadmap-heading"><div><span className="workspace-kicker">PRODUCTIEROADMAP</span><h2>KeyFlow is 68% compleet</h2><p>Voortgang naar de volledige live productieversie.</p></div><strong>68%</strong></div>
          <div className="roadmap-track"><span style={{ width: "68%" }} /></div>
          <div className="roadmap-steps">
            <span className="done">Basis & UX</span><span className="done">Excel-import</span><span className="done">Voorraad & planning</span><span className="current">Rollen & uitvoering</span><span>Database live</span><span>SSO & integraties</span><span>Productieacceptatie</span>
          </div>
        </section>
          </>
        )}

        {role === "management" && activeView === "inventory" && (
          <InventoryCatalog
            globalQuery={query}
            quantities={catalogQuantities}
            onReceive={(item) => {
              const currentStock = catalogQuantities[item.sku] ?? item.stock;
              setMutation({
                mode: "receipt",
                item: {
                  model: item.model,
                  sku: item.sku,
                  layout: item.layout,
                  stock: currentStock,
                  threshold: calculateCatalogThreshold(item.averageWeeklyDemand, item.leadTimeDays, item.safetyStockWeeks),
                },
                onConfirm: (newQuantity) => setCatalogQuantities((current) => ({ ...current, [item.sku]: newQuantity })),
              });
            }}
          />
        )}
        {role === "management" && activeView === "conversions" && <ConversionsWorkspace onNew={() => setAdvisorOpen(true)} />}
        {role === "management" && activeView === "orders" && <OrdersWorkspace />}
        {role === "management" && activeView === "models" && <ModelsWorkspace />}
        {role === "management" && activeView === "operations" && (
          <OperationsManagement
            quantities={catalogQuantities}
            transactions={transactions}
            policy={operationsPolicy}
            onPolicyChange={(nextPolicy) => {
              setOperationsPolicy(nextPolicy);
              setLastAction(`Conversiebeleid bijgewerkt · grens €${nextPolicy.thresholdEur}`);
            }}
          />
        )}
        {role === "management" && activeView === "reports" && <ReportsWorkspace />}

        <footer className="app-footer">
          <span><i /> Systeem gereed</span>
          <span>{lastAction || `Productieroadmap 68% · ${role === "management" ? "managementweergave" : "werknemersuitvoering"}`}</span>
        </footer>
        <ConversionAdvisor open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
        <AccessManagementDialog open={accessOpen} onClose={() => setAccessOpen(false)} />
        <InventoryImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onReview={setReviewBatchId}
        />
        {reviewBatchId && (
          <ImportReviewDialog batchId={reviewBatchId} onClose={() => setReviewBatchId(null)} />
        )}
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

function calculateCatalogThreshold(averageWeeklyDemand: number, leadTimeDays: number, safetyStockWeeks: number) {
  return Math.ceil(averageWeeklyDemand * (leadTimeDays / 7 + safetyStockWeeks));
}
