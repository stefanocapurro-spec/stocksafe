import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore }       from '../../stores/authStore'
import { useInventoryStore }  from '../../stores/inventoryStore'
import { useLocationStore }   from '../../stores/locationStore'
import { useEffect } from 'react'
import styles from './AppLayout.module.css'

const Logo = () => (
  <svg viewBox="0 0 64 64" width="26" height="26" style={{ display:'block', flexShrink:0 }}>
    <polygon points="32,2 62,32 32,62 2,32" fill="#F9A825"/>
    <polygon points="32,10 54,32 32,54 10,32" fill="#1565C0"/>
    <path d="M22 20 Q22 14 30 13 L36 13 Q44 13 44 20 Q44 27 36 30 L28 33 Q20 36 20 43 Q20 50 28 52 L36 52 Q44 52 44 45"
          fill="none" stroke="#C62828" strokeWidth="6" strokeLinecap="round"/>
    <path d="M22 20 Q22 14 30 13 L36 13 Q44 13 44 20 Q44 27 36 30 L28 33 Q20 36 20 43 Q20 50 28 52 L36 52 Q44 52 44 45"
          fill="none" stroke="#FFD600" strokeWidth="3.5" strokeLinecap="round"/>
  </svg>
)

const NAV = [
  { to:'/',          icon:'◈',  label:'Generale', end:true  },
  { to:'/inventory', icon:'▦',  label:'Scorte',   end:false },
  { to:'/add',       icon:'+',  label:'',         end:false, fab:true },
  { to:'/locations', icon:'📍', label:'Depositi', end:false },
  { to:'/settings',  icon:'⊙',  label:'Config',   end:false },
]

export function AppLayout() {
  const { user }     = useAuthStore()
  const { fetchAll } = useInventoryStore()
  const { locations, activeLocationId, fetchLocations } = useLocationStore()

  useEffect(() => {
    if (user) { fetchAll(user.id); fetchLocations(user.id) }
  }, [user, fetchAll, fetchLocations])

  const activeLoc = locations.find(l => l.id === activeLocationId)
  const unassigned = useInventoryStore(s => s.items.filter(i => !i.locationId).length)

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Logo/>
        <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontWeight:800, fontSize:'0.92rem', letterSpacing:'-0.02em' }}>StockSafe</span>
          {activeLoc && (
            <span style={{
              fontSize:'0.72rem', fontWeight:700, color:activeLoc.color,
              background:`${activeLoc.color}18`, border:`1px solid ${activeLoc.color}35`,
              borderRadius:99, padding:'2px 8px', flexShrink:0,
            }}>
              {activeLoc.icon} {activeLoc.name}
            </span>
          )}
        </div>
        {/* Badge "da assegnare" in header */}
        {unassigned > 0 && (
          <NavLink to="/unassigned" style={{ textDecoration:'none' }}>
            <span style={{
              background:'var(--red)', color:'#fff', borderRadius:99,
              fontSize:'0.68rem', fontWeight:800, padding:'2px 7px', flexShrink:0,
            }}>
              {unassigned} da assegnare
            </span>
          </NavLink>
        )}
      </header>

      <main className={styles.main}><Outlet/></main>

      <nav className={styles.nav}>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) =>
              `${styles.navItem} ${n.fab?styles.fab:''} ${isActive?styles.active:''}`
            }>
            <span className={styles.navIcon}>{n.icon}</span>
            {!n.fab && <span className={styles.navLabel}>{n.label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
