# StarkLotto — Estado del Proyecto

> Última revisión: 2026-06-02

---

## Resumen

DApp de lotería descentralizada en Starknet. Monorepo con Cairo smart contracts y frontend Next.js 15.

- **Contratos:** `packages/snfoundry/contracts/src/`
- **Frontend:** `packages/nextjs/`
- **Estado global:** ~75-80% completo. Arquitectura sólida, faltan integraciones clave para demo.

---

## Contratos Cairo — Estado

| Contrato | Líneas | Estado |
|---|---|---|
| `Lottery.cairo` | 1,733 | ✅ Funcional — gaps documentados abajo |
| `StarkPlayVault.cairo` | 695 | ✅ Funcional — cleanup pendiente |
| `StarkPlayERC20.cairo` | 403 | ✅ Completo |
| `LottoTicketNFT.cairo` | 335 | ⚠️ Escrito pero **NO integrado** en Lottery |
| `MockRandomness.cairo` | 63 | ⚠️ Solo mock — sin VRF real |

---

## CUs (User Stories) — Implementación

| CU | Descripción | Contrato | Tests | Estado |
|---|---|---|---|---|
| CU-01 | Comprar ticket | Lottery.cairo | test_CU01.cairo | ✅ Completo |
| CU-02 | Convertir STRKP → STRK | StarkPlayVault.cairo | test_CU02.cairo | ✅ Completo (159 tests) |
| CU-03 | Registro de tickets | Lottery.cairo | test_CU03.cairo | ✅ Completo |
| CU-04 | Desconocido | — | **NO EXISTE** | ❌ Sin tests |
| CU-05 | Distribuir premios | Lottery.cairo | test_CU05.cairo | ✅ Completo |
| CU-06 | Reclamar premio | Lottery.cairo | — | ✅ Implementado |

---

## Frontend — Estado

### Páginas existentes

| Ruta | Descripción | Estado |
|---|---|---|
| `/` | Landing page | ✅ Completa (Hero, About, Roadmap, HowItWorks, Team, CTA) |
| `/play` | Comprar tickets | ✅ Funcional |
| `/play/confirmation` | Confirmación compra | ✅ Existe |
| `/results` | Resultados de sorteos | ✅ Existe |
| `/results/[drawId]` | Detalle de sorteo | ✅ Existe |
| `/profile` | Tickets del usuario | ✅ Existe |
| `/prizes` | Premio / jackpot | ✅ Existe |
| `/admin` | Panel admin general | ✅ Existe |
| `/admin-lottery` | Admin lotería | ✅ Existe |
| `/jackpot-report` | Historial jackpot | ✅ Existe |
| `/dapp` | Herramienta developer | ✅ Existe |
| `/debug` | Debug contratos | ✅ Existe |

### Integraciones frontend

- ✅ Balances STRK y STRKP reales en dashboard (último commit)
- ✅ Wallet: Argent y Braavos vía starknet-react
- ✅ i18n con detección de idioma
- ✅ PWA configurado (desactivado en dev)
- ✅ TailwindCSS + DaisyUI
- ✅ Zustand para estado global
- ✅ `deployedContracts.ts` auto-generado al hacer deploy

---

## Gaps — Lo que falta

### Crítico (bloquea demo)

#### 1. NFT minting no integrado
- **Archivo:** `Lottery.cairo:546`
- **Problema:** `LottoTicketNFT.cairo` existe completo (335 líneas, ERC721) pero `BuyTicket` tiene un `// TODO: Mint the NFT here, for now it is simulated` — nunca llama al contrato NFT.
- **Lo que falta:** En `BuyTicket`, dispatch a `LottoTicketNFT` para mintear un NFT real por cada ticket comprado.

#### 2. Sin deploy en Sepolia / red real
- **Archivo:** `packages/snfoundry/deployments/` — solo contiene `clear.mjs`, sin deployments reales.
- **`deployedContracts.ts`** apunta a devnet local.
- **Lo que falta:** Deploy completo en Sepolia y actualizar `deployedContracts.ts`.

#### 3. CU-04 sin implementar
- **Problema:** Existe `test_CU01`, `test_CU02`, `test_CU03`, `test_CU05` pero **`test_CU04.cairo` no existe**. No está claro qué funcionalidad cubre CU-04.
- **Lo que falta:** Identificar qué es CU-04, implementarlo si falta, escribir tests.

### Importante (no bloquea demo pero es deuda técnica)

#### 4. VRF real (Pragma Oracle) no integrado
- **Archivo:** `Lottery.cairo:1712`
- **Problema:** `// TODO: We need to use VRF de Pragma Oracle to generate random numbers`. El contrato usa `MockRandomness` que es predecible — en mainnet/sepolia es un vector de ataque.
- **Lo que falta:** Reemplazar `MockRandomness` con integración real a Pragma VRF.

#### 5. Función pública en Vault que debería ser interna
- **Archivo:** `StarkPlayVault.cairo:375`
- **Problema:** `//TODO: delete fn public` — una función expuesta que no debería serlo.
- **Lo que falta:** Cambiar visibilidad o eliminar la función.

#### 6. test_CU04 ausente
- Ver punto 3 arriba.

### Menor (scaffold/boilerplate pendiente)

- `ContractVariables` en debug UI (`ContractByDebugUI.tsx:97`) — no existe equivalente en Starknet, comentado con TODO.
- `AddressInput` sin Starknet Name Service (`AddressInput.tsx:19`).
- Algunos `useMemo` optimizations pendientes en forms.

---

## Flujo completo para demo

Para una demo funcional end-to-end se necesita:

```
1. Deploy en Sepolia (todos los contratos)
   ↓
2. Integrar LottoTicketNFT en BuyTicket
   ↓
3. Crear draw activo (CreateNewDraw)
   ↓
4. Usuario compra ticket → recibe NFT real
   ↓
5. Admin ejecuta DrawNumbers (con MockRandomness por ahora)
   ↓
6. Admin ejecuta DistributePrizes
   ↓
7. Usuario ejecuta ClaimPrize → recibe STRKP
   ↓
8. Usuario convierte STRKP → STRK
```

---

## Comandos clave para retomar

```bash
# Setup
yarn install
yarn chain                          # devnet local (seed 0)
yarn deploy                         # deploy en devnet
yarn start                          # frontend en localhost:3000

# Contratos
yarn compile                        # scarb build
yarn test                           # snforge tests
scarb test --match-contract Lottery # tests específicos

# Deploy en Sepolia
yarn deploy --network sepolia
```

---

## Versiones requeridas

| Tool | Versión |
|---|---|
| Starknet-devnet | v0.4.0 |
| Scarb | v2.11.4 |
| Snforge | v0.41.0 |
| Cairo | v2.11.4 |
| Node.js | compatible Next.js 15 |
| Yarn | v3.2.3 |
