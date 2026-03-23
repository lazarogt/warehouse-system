# 🏭 Warehouse System

Sistema de gestión de almacenes full-stack diseñado con enfoque en **escalabilidad, mantenibilidad y consistencia de datos**.

---

## 🚀 Características principales

* Gestión de productos, inventario y ubicaciones
* Sistema de usuarios con roles
* Soft delete consistente en todo el sistema
* Arquitectura preparada para SaaS
* Backend robusto con control de integridad
* UI optimizada para rendimiento

---

## 🧠 Arquitectura

### Backend

* Node.js + Express
* PostgreSQL
* Soft delete centralizado
* Transacciones en operaciones críticas
* Filtros consistentes para datos activos

### Frontend

* React + Vite
* Componentes desacoplados
* Optimización de renderizado
* UI enfocada en productividad

---

## 🔒 Integridad de datos

El sistema implementa:

* Soft delete (`is_deleted`, `deleted_at`)
* Exclusión automática de registros eliminados
* Índices parciales para unicidad
* Operaciones transaccionales en acciones críticas

---

## ⚡ Rendimiento

* Reducción de re-renders innecesarios
* Uso de memoización (`useMemo`, `useCallback`)
* Debounce en filtros y búsqueda
* Animaciones optimizadas

---

## 🧪 Testing

* Tests de integración en backend
* Validación contra PostgreSQL real
* Cobertura de operaciones críticas

---

## 📦 Instalación

```bash
git clone https://github.com/lazarogt/warehouse-system.git
cd warehouse-system
```

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

---

## 🐳 Base de datos

```bash
docker compose up -d db
```

---

## 📌 Estado del proyecto

✔ Estable
✔ Mantenible
✔ Preparado para escalar

---

## 👨‍💻 Autor

Lázaro González
