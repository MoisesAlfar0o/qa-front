import { useEffect, useMemo, useState } from 'react';
import './lab.css';

// Target application used to test the platform end to end. Data lives in localStorage, so
// every isolated browser context starts from the same seed and edits persist within a run.

const STORAGE_KEY = 'qa-lab-data-v1';
const FLASH_KEY = 'qa-lab-flash';

const SEED = {
  products: [
    { id: 1, name: 'Moisés', category: 'Electrónica', currency: 'USD', price: 120, active: true },
    { id: 2, name: 'Moisés Jr', category: 'Hogar', currency: 'NIO', price: 45, active: true },
    { id: 3, name: 'Ana', category: 'Hogar', currency: 'USD', price: 80, active: false },
    { id: 4, name: 'Lámpara', category: 'Oficina', currency: 'EUR', price: 30, active: true },
  ],
  categories: [
    { id: 1, name: 'Electrónica', description: 'Dispositivos y accesorios' },
    { id: 2, name: 'Hogar', description: 'Artículos para la casa' },
    { id: 3, name: 'Oficina', description: 'Papelería y mobiliario' },
  ],
  clients: [
    { id: 1, name: 'Rosa Martínez', document: '001-1', status: 'Activo' },
    { id: 2, name: 'Luis Pérez', document: '001-2', status: 'Inactivo' },
  ],
  currencies: [
    { code: 'USD', name: 'Dólar estadounidense', rate: '36.6' },
    { code: 'NIO', name: 'Córdoba', rate: '1' },
    { code: 'EUR', name: 'Euro', rate: '39.8' },
  ],
  settings: { allowNegativePrices: false },
};

const MENU = [
  { label: 'Inicio', path: '/lab' },
  { label: 'Catálogos', id: 'catalogos', children: [{ label: 'Productos', path: '/lab/catalogos/productos' }, { label: 'Categorías', path: '/lab/catalogos/categorias' }] },
  { label: 'Clientes', id: 'clientes', children: [{ label: 'Personas naturales', path: '/lab/clientes/personas-naturales' }] },
  { label: 'Configuración', id: 'configuracion', children: [{ label: 'Productos', path: '/lab/configuracion/productos' }, { label: 'Monedas', path: '/lab/configuracion/monedas' }] },
  { label: 'Reportes', path: '/lab/reportes' },
];

function loadData() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored) return stored;
  } catch {
    // corrupt storage: fall back to the seed
  }
  return structuredClone(SEED);
}

function useStore() {
  const [data, setData] = useState(loadData);
  const update = (mutate) => setData((current) => {
    const next = mutate(structuredClone(current));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  return [data, update];
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = (next) => {
    window.history.pushState({}, '', next);
    setPath(next);
  };
  return [path, navigate];
}

function flash(message) {
  window.sessionStorage.setItem(FLASH_KEY, message);
}

function useFlash() {
  const [message] = useState(() => {
    const value = window.sessionStorage.getItem(FLASH_KEY);
    window.sessionStorage.removeItem(FLASH_KEY);
    return value;
  });
  return message;
}

function Link({ to, navigate, children, ...rest }) {
  return <a href={to} onClick={(event) => { event.preventDefault(); navigate(to); }} {...rest}>{children}</a>;
}

function Menu({ path, navigate }) {
  const initial = MENU.find((item) => item.children?.some((child) => path.startsWith(child.path)))?.id;
  const [open, setOpen] = useState(initial ? { [initial]: true } : {});
  return (
    <nav className="lab-menu" aria-label="Menú principal">
      <ul>
        {MENU.map((item) => item.children ? (
          <li key={item.id}>
            <button type="button" aria-expanded={Boolean(open[item.id])} aria-controls={`menu-${item.id}`} onClick={() => setOpen((current) => ({ ...current, [item.id]: !current[item.id] }))}>{item.label}<span className="lab-caret" aria-hidden="true">▾</span></button>
            {open[item.id] && <ul id={`menu-${item.id}`}>{item.children.map((child) => <li key={child.path}><Link to={child.path} navigate={navigate} aria-current={path === child.path ? 'page' : undefined}>{child.label}</Link></li>)}</ul>}
          </li>
        ) : <li key={item.path}><Link to={item.path} navigate={navigate} aria-current={path === item.path ? 'page' : undefined}>{item.label}</Link></li>)}
      </ul>
    </nav>
  );
}

function Breadcrumbs({ items }) {
  return <nav className="lab-breadcrumbs" aria-label="Ruta de navegación"><ol>{items.map((item, index) => <li key={item} aria-current={index === items.length - 1 ? 'page' : undefined}>{index > 0 && <span aria-hidden="true">/</span>}{item}</li>)}</ol></nav>;
}

function Toast({ message }) {
  return message ? <p className="lab-toast" role="status">{message}</p> : null;
}

const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function ProductsPage({ data, update, navigate }) {
  const message = useFlash();
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState('Todas');
  const [pendingDelete, setPendingDelete] = useState(null);
  const rows = data.products.filter((product) => normalize(product.name).includes(normalize(query)) && (currency === 'Todas' || product.currency === currency));
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Catálogos', 'Productos']} />
      <div className="lab-heading"><h1>Productos</h1><Link to="/lab/catalogos/productos/nuevo" navigate={navigate} className="lab-primary">Nuevo producto</Link></div>
      <Toast message={message} />
      <div className="lab-filters">
        <input type="text" placeholder="Buscar por nombre" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label>Moneda <select value={currency} onChange={(event) => setCurrency(event.target.value)}>{['Todas', 'USD', 'NIO', 'EUR'].map((code) => <option key={code}>{code}</option>)}</select></label>
        <a href="/lab/ayuda" target="_blank" rel="noreferrer">Ver ayuda</a>
      </div>
      <table aria-label="Lista de productos">
        <thead><tr><th>Nombre</th><th>Categoría</th><th>Moneda</th><th>Precio</th><th>Acciones</th></tr></thead>
        <tbody>
          {rows.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td><td>{product.category}</td><td>{product.currency}</td><td>{product.price}</td>
              <td className="lab-actions">
                <button type="button" className="icon-button" aria-label={`Editar ${product.name}`} title="Editar" onClick={() => navigate(`/lab/catalogos/productos/${product.id}/editar`)}>✎</button>
                <button type="button" className="icon-button danger" aria-label={`Eliminar ${product.name}`} title="Eliminar" onClick={() => setPendingDelete(product)}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="lab-empty">No se encontraron productos.</p>}
      {pendingDelete && (
        <div className="lab-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <h2 id="delete-title">Eliminar producto</h2>
          <p>¿Eliminar {pendingDelete.name}? Esta acción no se puede deshacer.</p>
          <div><button type="button" onClick={() => setPendingDelete(null)}>Cancelar</button><button type="button" className="danger" onClick={() => { update((current) => ({ ...current, products: current.products.filter((item) => item.id !== pendingDelete.id) })); setPendingDelete(null); }}>Confirmar eliminación</button></div>
        </div>
      )}
    </>
  );
}

function ProductForm({ data, update, navigate, productId }) {
  const existing = data.products.find((product) => product.id === productId);
  const [form, setForm] = useState(existing ?? { name: '', category: 'Electrónica', currency: 'USD', price: 0, active: true });
  const [error, setError] = useState('');
  if (productId && !existing) return <p role="alert">El producto no existe.</p>;
  const save = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    update((current) => {
      if (existing) return { ...current, products: current.products.map((item) => (item.id === existing.id ? { ...form, name: form.name.trim() } : item)) };
      const id = Math.max(0, ...current.products.map((item) => item.id)) + 1;
      return { ...current, products: [...current.products, { ...form, id, name: form.name.trim() }] };
    });
    flash(existing ? 'Producto actualizado' : 'Producto creado');
    navigate('/lab/catalogos/productos');
  };
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Catálogos', 'Productos', existing ? 'Editar' : 'Nuevo']} />
      <h1>{existing ? 'Editar producto' : 'Nuevo producto'}</h1>
      <form className="lab-form" onSubmit={save} noValidate>
        <label htmlFor="product-name">Nombre</label>
        <input id="product-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <label htmlFor="product-category">Categoría</label>
        <select id="product-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{data.categories.map((category) => <option key={category.id}>{category.name}</option>)}</select>
        <label htmlFor="product-currency">Moneda del producto</label>
        <select id="product-currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>{['USD', 'NIO', 'EUR'].map((code) => <option key={code}>{code}</option>)}</select>
        <label className="lab-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Activo</label>
        {error && <p className="lab-error" role="alert">{error}</p>}
        <div className="lab-form-actions"><button type="submit" className="lab-primary">Guardar</button><button type="button" onClick={() => navigate('/lab/catalogos/productos')}>Cancelar</button></div>
      </form>
    </>
  );
}

const PencilIcon = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" /></svg>;

function CategoriesPage({ data, navigate }) {
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Catálogos', 'Categorías']} />
      <h1>Categorías</h1>
      <table aria-label="Lista de categorías">
        <thead><tr><th>Nombre</th><th>Descripción</th><th>Acciones</th></tr></thead>
        <tbody>{data.categories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.description}</td><td className="lab-actions"><button type="button" className="icon-button" onClick={() => navigate(`/lab/catalogos/categorias/${category.id}/editar`)}><PencilIcon /></button></td></tr>)}</tbody>
      </table>
    </>
  );
}

function CategoryEdit({ data, update, navigate, categoryId }) {
  const category = data.categories.find((item) => item.id === categoryId);
  const [name, setName] = useState(category?.name ?? '');
  if (!category) return <p role="alert">La categoría no existe.</p>;
  return (
    <>
      <h1>Editar categoría</h1>
      <form className="lab-form" onSubmit={(event) => { event.preventDefault(); update((current) => ({ ...current, categories: current.categories.map((item) => (item.id === categoryId ? { ...item, name } : item)) })); flash('Categoría actualizada'); navigate('/lab/catalogos/categorias'); }}>
        <label htmlFor="category-name">Nombre de la categoría</label>
        <input id="category-name" value={name} onChange={(event) => setName(event.target.value)} />
        <div className="lab-form-actions"><button type="submit" className="lab-primary">Guardar</button></div>
      </form>
    </>
  );
}

function ClientsPage({ data }) {
  const [query, setQuery] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const rows = data.clients.filter((client) => normalize(client.name).includes(normalize(query)) && (!onlyActive || client.status === 'Activo'));
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Clientes', 'Personas naturales']} />
      <h1>Personas naturales</h1>
      <div className="lab-filters">
        <input type="text" placeholder="Buscar cliente" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="lab-check"><input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} /> Solo activos</label>
      </div>
      <table aria-label="Lista de clientes">
        <thead><tr><th>Nombre</th><th>Documento</th><th>Estado</th></tr></thead>
        <tbody>{rows.map((client) => <tr key={client.id}><td>{client.name}</td><td>{client.document}</td><td>{client.status}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function ProductSettings({ data, update }) {
  const [allow, setAllow] = useState(data.settings.allowNegativePrices);
  const [saved, setSaved] = useState('');
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Configuración', 'Productos']} />
      <h1>Configuración de productos</h1>
      <label className="lab-check"><input type="checkbox" checked={allow} onChange={(event) => setAllow(event.target.checked)} /> Permitir precios negativos</label>
      <div className="lab-form-actions"><button type="button" className="lab-primary" onClick={() => { update((current) => ({ ...current, settings: { allowNegativePrices: allow } })); setSaved('Configuración guardada'); }}>Guardar configuración</button></div>
      <Toast message={saved} />
    </>
  );
}

function CurrenciesPage({ data }) {
  const [query, setQuery] = useState('');
  const rows = data.currencies.filter((currency) => normalize(`${currency.code} ${currency.name}`).includes(normalize(query)));
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Configuración', 'Monedas']} />
      <h1>Monedas</h1>
      <div className="lab-filters"><input type="text" placeholder="Buscar por moneda" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <table aria-label="Lista de monedas">
        <thead><tr><th>Moneda</th><th>Nombre</th><th>Tasa</th></tr></thead>
        <tbody>{rows.map((currency) => <tr key={currency.code}><td>{currency.code}</td><td>{currency.name}</td><td>{currency.rate}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function ReportsPage() {
  const [state, setState] = useState('idle');
  useEffect(() => {
    if (state !== 'running') return undefined;
    const timer = window.setTimeout(() => setState('done'), 8000);
    return () => window.clearTimeout(timer);
  }, [state]);
  return (
    <>
      <Breadcrumbs items={['Laboratorio', 'Reportes']} />
      <h1>Reportes</h1>
      <button type="button" className="lab-primary" disabled={state === 'running'} onClick={() => setState('running')}>Generar reporte</button>
      {state === 'running' && <p role="status">Generando reporte…</p>}
      {state === 'done' && <p role="status">Reporte generado</p>}
    </>
  );
}

function route(path) {
  const edit = path.match(/^\/lab\/catalogos\/productos\/(\d+)\/editar$/);
  if (edit) return { page: 'product-form', id: Number(edit[1]) };
  const category = path.match(/^\/lab\/catalogos\/categorias\/(\d+)\/editar$/);
  if (category) return { page: 'category-edit', id: Number(category[1]) };
  return { page: path };
}

export function LabApp() {
  const [path, navigate] = usePath();
  const [data, update] = useStore();
  const current = useMemo(() => route(path), [path]);
  if (path === '/lab/ayuda') {
    return <main className="lab-help"><h1>Ayuda del laboratorio</h1><p>Esta página se abre en una pestaña nueva.</p></main>;
  }
  const props = { data, update, navigate };
  let content;
  switch (current.page) {
    case '/lab/catalogos/productos': content = <ProductsPage key={path} {...props} />; break;
    case '/lab/catalogos/productos/nuevo': content = <ProductForm key={path} {...props} />; break;
    case 'product-form': content = <ProductForm key={path} {...props} productId={current.id} />; break;
    case '/lab/catalogos/categorias': content = <CategoriesPage {...props} />; break;
    case 'category-edit': content = <CategoryEdit key={path} {...props} categoryId={current.id} />; break;
    case '/lab/clientes/personas-naturales': content = <ClientsPage {...props} />; break;
    case '/lab/configuracion/productos': content = <ProductSettings {...props} />; break;
    case '/lab/configuracion/monedas': content = <CurrenciesPage {...props} />; break;
    case '/lab/reportes': content = <ReportsPage />; break;
    default: content = <><h1>Laboratorio QA</h1><p>Aplicación de pruebas para la plataforma de automatización. Usa el menú para navegar.</p></>;
  }
  return (
    <div className="lab-shell">
      <header className="lab-header"><strong>Laboratorio QA</strong><span>Ambiente de pruebas</span></header>
      <div className="lab-body"><Menu path={path} navigate={navigate} /><main className="lab-main">{content}</main></div>
    </div>
  );
}
