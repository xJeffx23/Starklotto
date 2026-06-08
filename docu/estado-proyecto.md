# StarkLotto — Estado del Proyecto

> Última revisión: 2026-06-07

---

## Resumen

DApp de lotería descentralizada en Starknet. Monorepo con Cairo smart contracts y frontend Next.js 15.

- **Contratos:** `packages/snfoundry/contracts/src/`
- **Frontend:** `packages/nextjs/`
- **Estado global:** ~90% completo. NFT integrado, todos los CUs implementados (1-6), 336 tests. Pendiente: deploy Sepolia, VRF real, test_CU06.cairo.

---

## Contratos Cairo — Estado

| Contrato | Líneas | Estado |
|---|---|---|
| `Lottery.cairo` | 1,762 | ✅ Funcional — VRF real pendiente |
| `StarkPlayVault.cairo` | 693 | ✅ Completo — TODO public fn resuelto |
| `StarkPlayERC20.cairo` | 403 | ✅ Completo |
| `LottoTicketNFT.cairo` | 335 | ✅ Integrado en `BuyTicket` (condicional: si NFT address = 0, minting desactivado) |
| `MockRandomness.cairo` | 63 | ⚠️ Solo mock — sin VRF real |

---

## CUs (User Stories) — Implementación

| CU | Descripción | Contrato | Tests | # Tests | Estado |
|---|---|---|---|---|---|
| CU-01 | Comprar ticket | Lottery.cairo | test_CU01.cairo | 123 | ✅ Completo |
| CU-02 | Convertir STRKP → STRK | StarkPlayVault.cairo | test_CU02.cairo | 17 | ✅ Completo |
| CU-03 | Registro de tickets | Lottery.cairo | test_CU03.cairo | 68 | ✅ Completo |
| CU-04 | Ejecutar Sorteo (`RequestRandomGeneration` + `DrawNumbers`) | Lottery.cairo | test_CU04.cairo | 18 | ✅ Completo |
| CU-05 | Distribuir premios | Lottery.cairo | test_CU05.cairo | 6 | ✅ Completo |
| CU-06 | Reclamar premio | Lottery.cairo | ⚠️ sin test_CU06.cairo | 0 | ✅ Implementado — tests pendientes |

### Tests suplementarios

| Archivo | # Tests | Cobertura |
|---|---|---|
| `test_basic_functions.cairo` | 32 | Funciones core generales |
| `test_lottery_getters.cairo` | 39 | Getters del contrato Lottery |
| `test_ticket_recording.cairo` | 19 | Registro y almacenamiento de tickets |
| `test_jackpot_history.cairo` | 10 | Historial del jackpot |
| `test_reentrancy_guard.cairo` | 4 | Seguridad contra reentrancy |

**Total tests en el proyecto: 336** (232 CU + 104 suplementarios)

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
| `/about-us` | Sobre el proyecto | ✅ Existe |
| `/contact-us` | Contacto | ✅ Existe |
| `/how-it-works` | Cómo funciona | ✅ Existe |
| `/configure` | Configuración de red/wallet | ✅ Existe |
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

#### 1. Sin deploy en Sepolia / red real
- **Archivo:** `packages/snfoundry/deployments/` — solo contiene `clear.mjs`, sin deployments reales.
- **`deployedContracts.ts`** apunta a devnet local.
- **Lo que falta:** Deploy completo en Sepolia y actualizar `deployedContracts.ts`.

### Importante (no bloquea demo pero es deuda técnica)

#### 2. VRF real (Pragma Oracle) no integrado
- **Archivo:** `Lottery.cairo:1741`
- **Problema:** `// TODO: We need to use VRF de Pragma Oracle to generate random numbers`. El contrato usa `MockRandomness` que es predecible — en mainnet/sepolia es un vector de ataque.
- **Lo que falta:** Reemplazar `MockRandomness` con integración real a Pragma VRF.

### Resuelto recientemente ✅

#### ~~NFT minting no integrado~~ (resuelto — commit ca3f890)
- `BuyTicket` ahora llama a `ILottoTicketNFTDispatcher.mint_ticket()` si el NFT contract address está configurado (zero address = minting desactivado, compatible con tests).

#### ~~CU-04 sin implementar~~ (resuelto)
- `test_CU04.cairo` existe con 18 tests que cubren `RequestRandomGeneration` + `DrawNumbers`.

#### ~~Función pública en Vault~~ (resuelto — StarkPlayVault.cairo:372 modificado, pendiente commit)
- El comentario `//TODO: delete fn public` y la línea `//[external(v0)]` fueron eliminados. `_mint_strk_play` ya es función privada (prefijo `_`). Cambio unstaged en `git status`.

#### ~~CU-06 sin implementar~~ (resuelto — commit b52335a)
- `ClaimPrize` implementado con sistema de prize tokens. UI integrada. Falta test_CU06.cairo.

### Menor (scaffold/boilerplate pendiente)

- `ContractVariables` en debug UI (`ContractByDebugUI.tsx:97` y `ContractUI.tsx:97`) — no existe equivalente en Starknet, comentado con TODO.
- `AddressInput` sin Starknet Name Service (`AddressInput.tsx:19`).
- `useMemo` optimization pendiente en `WriteOnlyFunctionForm.tsx:119` (tanto en `contractByApp/` como en `contractByDebug/` y `debug/_components/`).
- `DisplayVariable.tsx:39` — notificación de error pendiente en bloque `blockIdentifier: "pending"`.
- **test_CU06.cairo** — no existe, CU-06 carece de tests automatizados.

---

## Flujo completo para demo

Para una demo funcional end-to-end se necesita:

```
1. Deploy en Sepolia (todos los contratos, incluyendo LottoTicketNFT)
   ↓
2. Llamar SetNFTContractAddress en Lottery con la dirección deployada
   ↓
3. Crear draw activo (CreateNewDraw)
   ↓
4. Usuario compra ticket → recibe NFT real (ERC721)
   ↓
5. Admin ejecuta RequestRandomGeneration + DrawNumbers (MockRandomness por ahora)
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
