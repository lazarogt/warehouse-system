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
Convención UI:
`client/src/i18n/es.ts` concentra el texto visible del frontend
Usa `t("clave")` para etiquetas, botones, placeholders, avisos y mensajes de error del cliente
La UI debe mantenerse en español completo, con copy corto y consistente
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

## Desktop Offline Mode

- Totalmente funcional sin backend
- Base de datos local SQLite
- Arquitectura basada en IPC
- Autenticación offline
- Copias de seguridad automáticas

Scripts disponibles desde la raíz del repositorio:
`npm run dev:desktop`: levanta Vite en `http://localhost:5173`, compila Electron en watch y abre la ventana desktop
`npm run qa:desktop`: inicia el flujo desktop para validación manual
`npm run build:desktop`: genera el build de React y compila Electron
`npm run start:desktop`: ejecuta Electron en modo producción cargando `client/dist`
`npm run dist:desktop`: empaqueta instaladores desktop en `dist-electron`
`npm run release:desktop`: build + publicación con `electron-builder` usando la configuración de release
Proceso de release documentado en [`desktop/docs/release.md`](desktop/docs/release.md)
Instalación requerida:
`npm install` en la raíz para `concurrently`
`npm install` dentro de `desktop`

## Run Desktop

```bash
npm run dev:desktop
```

## Notes

- Los módulos nativos requieren rebuild:

```bash
npm run postinstall --prefix desktop
```

Flujo de desarrollo:
`dev:desktop` espera a que Vite responda antes de abrir Electron
Electron corre en una sola instancia y reutiliza la ventana existente si se intenta abrir otra
En desarrollo el renderer carga `http://localhost:5173`
En producción Electron sirve el SPA desde `client/dist` usando fallback a `index.html` para rutas internas
Esto evita pantallas en blanco al refrescar rutas del frontend dentro del shell desktop
Base de datos embebida:
Electron inicializa SQLite en el proceso principal usando `better-sqlite3`
La base se guarda en `app.getPath('userData')/warehouse.db`
Los backups se guardan en `app.getPath('userData')/backups`
La cola de sincronización persistente se guarda en `app.getPath('userData')/warehouse-sync-state.json`
El schema se aplica con migraciones versionadas y no elimina tablas existentes
Solo en desarrollo se insertan datos seed de ejemplo para `products`, `stock_movements` y `users`
La base no se expone al renderer: queda encapsulada en servicios del main process listos para IPC futuro
Arquitectura multi-almacén desktop:
`warehouses` modela almacenes físicos
`warehouses.is_active` aplica soft delete y preserva histórico
`warehouse_stock` almacena existencias por `(warehouse_id, product_id)`
`stock_movements` ahora registra `warehouse_id`, `reason` y `metadata` JSON
`products.stock` se mantiene como stock agregado para compatibilidad con el catálogo actual
UX operativo desktop:
Selector global de almacén con selección persistida al reabrir la app
Alta rápida de almacén
Edición y desactivación de almacenes desde Configuración sin recargar la vista
Alta rápida de producto con cantidad inicial trazable en el almacén seleccionado
Panel rápido para ajustar cantidad por producto dentro del almacén activo usando movimientos
Modal rápido para transferir stock entre almacenes en menos de 5 campos
Modal rápido de despacho con almacén activo preseleccionado, stock en tiempo real y validación de stock suficiente
Exportación local en 1 clic de despachos, inventario por almacén y movimientos en PDF o Excel
Si se desactiva el almacén activo, la app selecciona automáticamente otro almacén válido
Resiliencia offline desktop:
Sync opcional: si no hay backend, el motor local sigue funcionando y la sincronización solo se difiere
Backups manuales y automáticos cada 30 minutos con rotación máxima de 10 archivos
Chequeo `PRAGMA integrity_check` al arrancar con opción de restaurar un backup antes de abrir la ventana
Renderer offline-first:
`client/src/services/data-provider.ts` decide API vs IPC según disponibilidad del backend
Badge global `Modo sin conexión` cuando el backend no responde
Productos, stock, movimientos y alertas usan fallback local por IPC sin tumbar la UI
El scope visual por defecto es `Este almacén`, usando `selectedWarehouseId`; el toggle `Todos` habilita la vista global multi-almacén
Las consultas scoped duplican filas por almacén cuando el usuario cambia a `Todos`, y la tabla de productos añade la columna `Almacén`
Despachos desktop registran un movimiento `OUT` con `reason = dispatch` y `metadata = { customer, notes }`
Las exportaciones desktop usan `pdfkit`, `exceljs` y `dialog.showSaveDialog` sin exponer filesystem al renderer
👨‍💻 Autor

Lázaro González Torres
📧 lazarogonzaleztorres091@gmail.com

📱 +53 55613220
