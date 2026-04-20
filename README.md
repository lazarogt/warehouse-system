🏭 Warehouse System

Sistema de gestión de almacenes full-stack diseñado con enfoque en escalabilidad, mantenibilidad y consistencia de datos.

🚀 Características principales
Gestión de productos, inventario y ubicaciones
Sistema de usuarios con roles
Soft delete consistente en todo el sistema
Arquitectura preparada para SaaS
Backend robusto con control de integridad
UI optimizada para rendimiento
Sistema de atributos dinámicos por categoría
Operaciones avanzadas de almacén (transferencias, ajustes, conteos cíclicos)
🧠 Arquitectura del sistema

El proyecto está dividido en:

client: frontend con React + TypeScript + Vite
server: backend con Node.js + Express + TypeScript
shared: tipos y constantes compartidas
docker: infraestructura de contenedores
server/src/lib/migrations: migraciones SQLite versionadas
🗄️ Base de datos
Motor: SQLite (better-sqlite3)
Funciona offline, sin dependencia de PostgreSQL
Soporta transacciones en operaciones críticas
Trazabilidad en stock_movements
Stock consolidado en warehouse_stock
Resolución de ruta:
SQLITE_DB_PATH (si existe)
Electron userData/database.db
./data/database.db
Docker: /data/database.db (persistente)
⚡ Levantar el proyecto
Backend
cd server
npm install
npm run dev
Frontend
cd client
npm install
npm run dev
Docker DB
docker compose up -d db
🔒 Autenticación y usuarios
Roles: admin, manager, operator
Auth con JWT + cookies httpOnly
Login seguro con bcrypt
Sesiones persistidas en base de datos
Admin inicial
username: administrador
email: admin@warehouse.local
password: admin123
👥 Gestión de usuarios
Solo admin puede crear/editar/eliminar usuarios
Reset de password con flag mustChangePassword
Flujo obligatorio de cambio de contraseña tras reset
📦 Inventario
Movimientos de entrada/salida
Bloqueo de stock negativo
Auditoría completa por usuario
Trazabilidad en stock_movements
🏢 Ubicaciones y almacenes
Jerarquía de ubicaciones (zona → rack → bin)
Soporte multi-almacén
Estado activo/inactivo
🔄 Transferencias
Estados: pending, approved, completed, cancelled
Movimiento transaccional entre almacenes
Control por roles
📊 Ajustes y conteos cíclicos
Ajustes manuales con motivo obligatorio
Conteos físicos con conciliación de stock
Estados de ciclo: draft, in_progress, completed
🧩 Productos y atributos dinámicos

Sistema universal de productos:

Tipos de atributos:
text
number
boolean
date
select
multiselect
json
Reglas:
atributos configurables por categoría
validación de required
compatibilidad total con inventario y exportaciones
valores preservados si atributo se desactiva
📦 Exportaciones
Productos → Excel / PDF
Movimientos → Excel / PDF
Control por roles (admin, manager)
🚨 Alertas
Productos con stock bajo (stock <= stock_minimo)
Dashboard con indicadores visuales
Endpoint dedicado de alertas
🔍 Lookup rápido
GET /api/products/lookup?sku=XXX
GET /api/products/lookup?barcode=XXX
🖥️ Frontend

Módulos principales:

Dashboard
Usuarios
Productos
Inventario
Movimientos
Ubicaciones
Transferencias
Ajustes
Conteos cíclicos
Configuración
🔐 Integridad de datos
Soft delete global
Transacciones en operaciones críticas
Índices para unicidad
Validación de atributos dinámicos
🧪 Testing
Tests de integración backend
Validación de API REST
Cobertura de operaciones críticas
🐳 Servicios
Frontend: http://localhost:5173
Backend: http://localhost:3000
Health: /api/health
DB: SQLite local o Docker volume
🖥️ Desktop App (Electron)
El módulo `desktop` agrega un shell nativo sobre el frontend React existente, sin modificar la lógica del backend.
Scripts disponibles desde la raíz del repositorio:
`npm run dev:desktop`: levanta Vite en `http://localhost:5173`, compila Electron en watch y abre la ventana desktop
`npm run build:desktop`: genera el build de React y compila Electron
`npm run start:desktop`: ejecuta Electron en modo producción cargando `client/dist`
Instalación requerida:
`npm install` en la raíz para `concurrently`
`npm install` dentro de `desktop`
👨‍💻 Autor

Lázaro González Torres
📧 lazarogonzaleztorres091@gmail.com

📱 +53 55613220
