# warehouse-system

Base tecnica de un sistema de gestion de almacenes, preparada para crecer por fases.

## Estructura

- `client`: frontend con React + TypeScript + Vite
- `server`: backend con Node.js + Express + TypeScript
- `shared`: tipos y constantes compartidas
- `docker`: Dockerfiles del frontend y backend
- `db`: espacio reservado para configuracion inicial de base de datos

## Requisitos

- Docker
- Docker Compose

## Levantar el proyecto

1. Crear el archivo `.env` a partir de `.env.example` si necesitas cambiar valores.
2. Ejecutar:

```bash
docker compose up --build
```

## Variables de entorno principales

- `POSTGRES_PORT`: puerto expuesto de PostgreSQL en el host
- `DB_HOST`: host para ejecucion local del backend o pruebas
- `DB_PORT`: puerto para ejecucion local del backend o pruebas
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`: credenciales de base de datos
- `SERVER_PORT`: puerto del backend
- `CLIENT_PORT`: puerto del frontend
- `JWT_SECRET`: variable reservada para despliegues locales y futuras extensiones de auth
- `VITE_API_URL`: en Docker/local con Vite proxy debe ser `/api`
- `VITE_PROXY_TARGET`: destino interno del proxy de Vite, por defecto `http://server:3000` en Docker
- `SESSION_COOKIE_NAME`: nombre de la cookie de sesion
- `SESSION_TTL_HOURS`: duracion de sesion en horas
- `DEFAULT_ADMIN_NAME`, `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`: usuario admin inicial

## Fase 2

Se implemento el modelo principal de inventario con:

- CRUD de `warehouse`
- CRUD de `category`
- CRUD de `product`
- registro de movimientos de stock en `entry` y `exit`
- consulta de stock actual por producto y por almacen
- control transaccional para evitar stock negativo
- pruebas minimas de integracion para endpoints principales

## Fase 3

Se implemento autenticacion y control de acceso por roles con:

- modelo `users` con roles `admin`, `manager` y `operator`
- contrasenas hasheadas de forma segura
- sesiones persistidas en base de datos y mantenidas con cookie `httpOnly`
- `login`, `register`, `logout` y `me`
- middleware de autenticacion y autorizacion por roles
- gestion minima de usuarios para `admin`
- compatibilidad con la API de inventario de la fase anterior
- pruebas minimas de autenticacion y autorizacion

## Fase 4.4

Se integro la gestion operativa de productos e inventario en el dashboard admin existente con:

- seccion `Productos` conectada a la API real
- seccion `Inventario` con formulario de movimientos y tabla de trazabilidad
- header del dashboard conectado a sesion real y `logout` funcional
- CRUD completo de productos con `precio`, `stock minimo` y `stock actual` consolidado
- movimientos de stock con usuario responsable, bloqueo de stock negativo y consistencia transaccional
- pruebas minimas para CRUD de productos, permisos por rol y movimientos

## Fase 4.5

Se consolido el dashboard administrativo completo con:

- sidebar funcional y responsive con `Dashboard`, `Usuarios`, `Productos`, `Inventario`, `Movimientos` y `Configuracion`
- carga diferida de secciones pesadas para mejorar el bundle inicial
- `Configuracion` integrada como vista operativa del sistema
- `Movimientos` separada visualmente de `Inventario` sin romper la base existente
- productos con paginacion y filtros por nombre, categoria, stock minimo y stock actual
- validacion preventiva de stock suficiente en frontend antes de registrar salidas
- CRUD de usuarios completado con `GET /api/users/:id`

## Fase 6

Se incorporo valor de negocio con exportaciones y alertas operativas:

- exportacion de productos a `Excel` y `PDF`
- exportacion de movimientos a `Excel` y `PDF`
- validacion por roles para reportes: `admin` y `manager` permitidos, `operator` restringido
- endpoint de alertas para productos con `stock_actual <= stock_minimo`
- badge visual de alertas en el sidebar
- dashboard con bloque destacado de productos criticos
- inventario con resaltado visual de productos en estado critico
- toasts y loader durante la generacion de archivos

## Fase 7

Se incorporo un modelo universal de productos con atributos dinamicos por categoria usando un enfoque hibrido:

- `products` mantiene los campos base existentes
- `category_attributes` define atributos configurables por categoria
- `product_attributes` almacena valores normalizados por producto
- validacion de atributos `required` y por tipo en service layer
- lectura de productos con atributos dinamicos agrupados en la respuesta
- UI admin en `Configuracion` para CRUD de atributos por categoria
- `ProductForm` dinamico segun la categoria seleccionada
- compatibilidad total con inventario, movimientos, alertas y exportaciones

## Fase 7.1

Se preparo el sistema para pruebas reales con datos iniciales y gestion avanzada de usuarios:

- seed automatico si la base de datos esta vacia
- comando manual `npm run seed` en `server`
- admin inicial con `username`, `email`, `role` y `status`
- login compatible por `username` o `email`
- passwords nuevas con `bcrypt` y compatibilidad de verificacion con hashes previos
- endpoint admin para resetear password temporal de usuarios
- categorias base, atributos por categoria, productos de prueba y stock inicial
- datos visibles en UI desde el primer arranque

## Fase 7.2

Se endurecio el sistema para uso real sin romper compatibilidad con las fases anteriores:

- cambio obligatorio de password despues de un reset admin
- `POST /api/auth/change-password` para que cada usuario actualice su propia credencial
- reset de password seguro con devolucion de password temporal solo en desarrollo
- en produccion el reset responde sin exponer la password temporal
- seed seguro e idempotente para admin inicial, categorias base, atributos base y productos demo
- logging basico y no bloqueante para acciones criticas como login, reset, cambio de password y altas/bajas clave
- bloqueo del dashboard hasta completar el cambio de password cuando `mustChangePassword = true`

## Fase 7.3

Se completo la universalidad operativa del catalogo para cualquier tipo de almacen:

- productos base con `sku` opcional, precio, stock minimo y categoria
- atributos dinamicos por categoria con soporte real para `text`, `number`, `boolean`, `date`, `select`, `multiselect` y `json`
- formulario de producto realmente dinamico segun la categoria elegida
- preservacion segura de valores cuando un atributo pasa a inactivo
- administracion visual de atributos por categoria con uso, activacion/desactivacion y borrado seguro
- filtro basico por atributo dinamico y busqueda por nombre, `sku` o categoria
- compatibilidad completa con inventario, exportaciones, alertas, seed y auth

## Fase 8

Se convirtio el sistema en una base de operacion avanzada de almacenes sin perder compatibilidad con las fases anteriores:

- ubicaciones internas por almacen con jerarquia simple y estado activo/inactivo
- stock por almacen y por ubicacion interna cuando aplica
- transferencias entre almacenes o ubicaciones con estados `pending`, `approved`, `completed` y `cancelled`
- ajustes de inventario auditados con motivo obligatorio
- conteos ciclicos con diferencias y conciliacion opcional sobre stock real
- lookup rapido de productos por `sku` o `barcode`
- dashboard ampliado con secciones `Ubicaciones`, `Transferencias`, `Ajustes` y `Conteos ciclicos`
- compatibilidad completa con auth, usuarios admin-only, productos universales, exportaciones, alertas y seed

## Administracion de usuarios

El flujo de usuarios quedo cerrado completamente para operacion real:

- solo `admin` puede crear usuarios
- solo `admin` puede editar usuarios
- solo `admin` puede cambiar roles
- solo `admin` puede resetear passwords
- `manager` y `operator` no pueden administrar usuarios
- no existe registro publico de usuarios desde `/api/auth/register`

Flujo esperado desde el dashboard:

1. El admin entra a `Usuarios`.
2. Crea la cuenta con `username`, `email`, `name`, `status` y `role`.
3. Si necesita actualizar credenciales, usa `Reset Password`.
4. El usuario reseteado inicia sesion y completa `change-password` si queda con cambio obligatorio.

## Roles

- `admin`: acceso total, incluida creacion, edicion, eliminacion, roles y reset de usuarios
- `manager`: gestion operativa del inventario y mantenimiento de catalogos, sin administracion de usuarios
- `operator`: consultas y movimientos de stock, sin mantenimiento de catalogos ni usuarios

## Endpoints backend

- `GET /api/health`
- `POST /api/auth/register` deshabilitado para registro publico
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `GET /api/users` solo admin
- `GET /api/users/:id` solo admin
- `POST /api/users` solo admin
- `PUT /api/users/:id` solo admin
- `PUT /api/users/:id/reset-password` solo admin
- `DELETE /api/users/:id` solo admin
- `PATCH /api/users/:id/role` solo admin
- `GET|POST /api/warehouses`
- `GET|PUT|DELETE /api/warehouses/:id`
- `GET|POST /api/categories`
- `GET|PUT|DELETE /api/categories/:id`
- `GET|POST /api/categories/:id/attributes`
- `PUT|DELETE /api/categories/:id/attributes/:attrId`
- `GET /api/products?page=&pageSize=&search=&categoryId=&attributeKey=&attributeValue=&maximumMinimumStock=&maximumCurrentStock=`
- `GET /api/products/lookup?sku=`
- `GET /api/products/lookup?barcode=`
- `POST /api/products`
- `GET|PUT|DELETE /api/products/:id`
- `POST /api/inventory/movements`
- `GET /api/inventory/movements?limit=`
- `GET /api/inventory/stock?productId=&warehouseId=&warehouseLocationId=`
- `GET|POST /api/locations`
- `GET|PUT|DELETE /api/locations/:id`
- `GET /api/transfers`
- `GET /api/transfers/:id`
- `POST /api/transfers`
- `PATCH /api/transfers/:id/approve`
- `PATCH /api/transfers/:id/complete`
- `PATCH /api/transfers/:id/cancel`
- `GET /api/adjustments`
- `GET /api/adjustments/:id`
- `POST /api/adjustments`
- `GET /api/cycle-counts`
- `GET /api/cycle-counts/:id`
- `POST /api/cycle-counts`
- `POST /api/cycle-counts/:id/items`
- `PATCH /api/cycle-counts/:id/items/:itemId`
- `PATCH /api/cycle-counts/:id/start`
- `PATCH /api/cycle-counts/:id/complete`
- `PATCH /api/cycle-counts/:id/cancel`
- `GET /api/alerts/low-stock`
- `GET /api/reports/products/export?format=excel|pdf`
- `GET /api/reports/movements/export?format=excel|pdf`

## Dashboard frontend

- `Dashboard`: metricas, alertas y graficos simples
- `Usuarios`: gestion exclusiva de admin con alta, edicion, eliminacion, roles y reset de password
- `Productos`: tabla responsive, filtros, detalle y formulario dinamico de crear/editar
- `Inventario`: movimientos recientes, alertas, stock disponible y formulario de entrada/salida
- `Movimientos`: vista enfocada en trazabilidad, registro y exportacion de movimientos
- `Ubicaciones`: CRUD visual de zonas, racks, bins y estructura interna por almacen
- `Transferencias`: formulario de traslado y seguimiento por estado
- `Ajustes`: correcciones manuales auditadas con motivo obligatorio
- `Conteos ciclicos`: conteo fisico, diferencias y cierre con ajuste opcional
- `Configuracion`: estado del sistema, salud, version, matriz de roles y gestion admin de atributos por categoria

## Modelo universal

Flujo base:

1. Crear o seleccionar una categoria.
2. Definir atributos en `/api/categories/:id/attributes`.
3. Crear o editar productos enviando `attributes` junto a los campos base y `sku` si aplica.

Tipos soportados para atributos:

- `text`
- `number`
- `boolean`
- `date`
- `select`
- `multiselect`
- `json`

Reglas principales:

- un producto puede existir aunque su categoria no tenga atributos
- `required` se valida al crear y actualizar productos
- `select` y `multiselect` validan contra `options`
- `multiselect` se almacena normalizado sin romper el modelo relacional
- `json` requiere contenido JSON valido
- atributos en uso no se eliminan de forma destructiva: deben desactivarse primero
- si un atributo se vuelve inactivo, los productos existentes conservan su valor

## Producto universal

La idea del catalogo universal es cubrir distintas industrias sin hardcodear campos por sector:

- electronica: `marca`, `modelo`, `garantia_meses`, `voltaje`
- alimentos: `fecha_vencimiento`, `peso`, `perecedero`
- ropa: `talla`, `color`, `material`
- ferreteria: `material`, `peso`, `uso`
- nuevos rubros: puedes crear una categoria nueva y definir sus propios atributos sin tocar la tabla `products`

## Operacion avanzada de almacen

### Ubicaciones internas

Flujo base:

1. Crear el almacen base.
2. Definir ubicaciones internas en `/api/locations` con `code`, `name`, `type` y padre opcional.
3. Usar la ubicacion al registrar movimientos, ajustes, transferencias o conteos.

Tipos sugeridos:

- `zone`
- `aisle`
- `rack`
- `shelf`
- `bin`
- `staging`
- `other`

### Transferencias de stock

Flujo base:

1. Crear una transferencia en `/api/transfers`.
2. Un `admin` o `manager` puede aprobarla.
3. Al completarla, el stock se descuenta del origen y se suma al destino de forma transaccional.
4. Si se cancela antes de completar, no altera stock.

Permisos:

- `admin`: todo
- `manager`: crear, aprobar, completar y cancelar
- `operator`: consultar y solicitar

### Ajustes de inventario

Flujo base:

1. Seleccionar almacen y ubicacion opcional.
2. Elegir producto, tipo de ajuste y cantidad final deseada.
3. Registrar motivo obligatorio.
4. El sistema recalcula stock real y deja auditoria en `/api/adjustments`.

Permisos:

- `admin`: crear y consultar
- `manager`: crear y consultar
- `operator`: solo consulta

### Conteos ciclicos

Flujo base:

1. Crear conteo en `/api/cycle-counts`.
2. Agregar items al conteo.
3. Marcar cantidades contadas.
4. Completar el conteo y, si corresponde, aplicar ajustes desde la diferencia.

Estados:

- `draft`
- `in_progress`
- `completed`
- `cancelled`

### Lookup rapido por SKU o barcode

Para operacion rapida puedes consultar:

```bash
GET /api/products/lookup?sku=TRF-TERM-001
GET /api/products/lookup?barcode=990000000001
```

La respuesta devuelve el producto con atributos dinamicos y stock consolidado.

## Pruebas

Con la base de datos levantada, ejecuta:

```bash
cd server
npm test
```

Para compilar frontend y backend:

```bash
cd server && npm run build
cd ../client && npm run build
```

Para ejecutar el seed manualmente:

```bash
cd server
npm run seed
```

Ejemplo de busqueda y filtro:

```bash
GET /api/products?page=1&pageSize=10&search=ELEC-DRILL
GET /api/products?page=1&pageSize=10&categoryId=1&attributeKey=voltaje&attributeValue=220V
```

El seed es idempotente:

- crea el admin inicial solo si no existe
- crea categorias, atributos base y productos demo solo si faltan
- evita duplicados al volver a ejecutar `npm run seed`

Para exportaciones y alertas, recuerda iniciar sesion con un usuario `admin` o `manager` si necesitas descargar reportes. Los usuarios `operator` pueden consultar alertas y operar inventario, pero no descargar exportaciones.

## Admin inicial

Al levantar el backend se garantiza un usuario administrador por defecto usando las variables de entorno:

- username: `administrador`
- email: `admin@warehouse.local`
- password: `admin123`

## Reset y cambio obligatorio de password

Flujo operativo:

1. Un `admin` ejecuta `PUT /api/users/:id/reset-password`.
2. La cuenta queda marcada con `mustChangePassword = true`.
3. En el siguiente login, el usuario puede autenticarse pero no puede usar el dashboard hasta completar `POST /api/auth/change-password`.
4. Al cambiarla correctamente, la marca obligatoria se limpia y la sesion vuelve al flujo normal.

Diferencia por entorno:

- desarrollo: el reset devuelve la password temporal una sola vez en la respuesta
- produccion: el reset responde solo con `message: "Password reset successfully"`

## Seed inicial

Si la base esta vacia, el sistema crea automaticamente:

- categorias: `Electrónicos`, `Alimentos`, `Ropa`, `Ferretería`
- atributos dinamicos por categoria
- productos de prueba con precio, stock y atributos completos
- almacen inicial para pruebas locales

Si la base ya contiene datos base o el admin inicial, el seed no los duplica.

## Servicios

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/health`
- PostgreSQL: `localhost:55432`
