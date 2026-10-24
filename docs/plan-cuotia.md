# Cuotia - Plan histórico del Ideatón Pura Vida

> Documento de planeamiento original; algunas ideas ya no reflejan el producto actual. Los círculos ya no pagan por turnos ni depositan fondos agrupados en Writz. La integración actual de Writz Earn permite depósitos y retiros personales de Blend Testnet USDC, fuera de los círculos. Consulta `writz-integration-plan.md` para los límites vigentes.

> **Círculos de ahorro que crecen mientras esperan.**
> Un contrato en Stellar registra aportes por persona y permite reclamar el total aportado al completar el círculo o cancelar tras el vencimiento.

- **Evento:** Ideatón Pura Vida (23 al 26 de octubre de 2026) · Plataforma: Stellar APEX
- **Track:** 🌱 Génesis (desde cero)
- **Premios a los que apunta:** Génesis (200 / 100 USDC) + bounty de Writz (100 / 50 USDC)
- **Concepto:** "círculo de ahorro" (en Costa Rica, "tanda")
- **¿Integra Writz?** Sí, como Earn personal opcional en Testnet; no se invierten los fondos de los círculos.

---

## 1. La idea en palabras simples

Un grupo de personas aporta una cuota cada semana o mes. En cada ronda una persona recibe todo el bote (el pozo). Así funciona una tanda.

**Dos problemas reales:**
1. **Confianza:** el organizador custodia la plata. Si desaparece, todos pierden.
2. **Dinero parado:** el bote espera días o semanas sin generar nada.

**Lo que hace Cuotia:**
- Un **contrato en Stellar (Soroban)** custodia los aportes. Nadie puede quedarse con el bote y los turnos se ejecutan según reglas que todos pueden ver.
- Cada integrante puede usar Writz Earn desde su wallet, por separado de los fondos del círculo. El APY es variable y no representa rendimiento ganado por Cuotia.

---

## 2. Cómo cumple la rúbrica de APEX

| Criterio | Peso | Cómo lo atacamos |
|---|---|---|
| **Ajuste real a Stellar** | 30-33% | Soroban custodia fondos y reglas; USDC como activo de pago; comisiones casi cero hacen viable aportes pequeños; trustlines y wallets de Stellar. Writz Earn corre sobre Stellar (DeFindex + Blend). |
| **Validación del problema** | 20-22% | 10 o más entrevistas a gente que participa o ha participado en tandas, capturas de grupos de WhatsApp (sin datos personales), cifras de cuánto dinero mueve una tanda típica. **Esto lo hace una persona, no la IA.** |
| **Viabilidad de negocio** | 20-22% | Cliente: grupos de ahorro, cooperativas, asociaciones. Modelo: pequeña parte del rendimiento (Earn ya cobra 1% de performance fee sobre el rendimiento; Cuotia podría tomar una fracción del rendimiento, nunca del capital). Competencia: tandas en WhatsApp/Excel, apps de ahorro tradicionales. Diferencia: custodia por contrato + rendimiento. |
| **Factibilidad técnica** | 20-22% | Un contrato Soroban chico, frontend con wallet, integración de Earn ya existente en testnet. Reutiliza herramientas del ecosistema (Stellar SDK, Wallets Kit, scaffold). |
| **Claridad de la presentación** | 10% | Pitch de 3 min + demo de 2 min con un círculo real de 3 personas en testnet. |

---

## 3. Integración con Writz (lo que dicen los docs)

**Writz Earn** es un vault de USDC construido con DeFindex que presta en Blend.

| Dato | Valor |
|---|---|
| Red | Stellar testnet |
| Vault | `CBMHGL7GGGHODEDDJ5H2LKJEFHJWBRSQUKOXMC4FKOFDZK5HBKW6PI2S` |
| Participación (shares) | `wzUSDC`, se mintean a la cuenta que firma el depósito |
| Activo de depósito | **USDC de testnet de Blend** (no el USDC de Circle). Se consigue en el faucet de Blend testnet |
| Estrategia | Blend USDC Strategy |
| Comisión | Ninguna de entrada/salida. 1% del rendimiento (se reparte entre Writz y DeFindex) |
| Bloqueo | Ninguno, se retira cuando quieras |
| Modelo de custodia | No custodial. El relayer arma la transacción sin firmar; la wallet firma; el navegador la envía |

**Endpoints del relayer** (público en `https://api.testnet.writz.xyz`):
- `GET /defindex/apy` - APY actual del vault
- `GET /defindex/position` - posición de una cuenta
- `POST /defindex/deposit` - devuelve transacción sin firmar
- `POST /defindex/withdraw` - devuelve transacción sin firmar
- `GET /metrics/tvl`, `GET /metrics/retention`

**Referencias en el repo de Writz** (leer antes de codificar):
- `frontend/app/src/lib/flows/earn.ts` - flujo de construir, firmar y enviar
- `relayer/README.md` - rutas y cuerpo de las peticiones
- `contracts/deployments/defindex-vault-testnet.md` - direcciones y roles del vault
- Prueba end-to-end del ciclo de Earn en el README del relayer

### ⚠️ Decisión técnica clave (la primera a resolver)

Los docs describen Earn pensado para **una cuenta de usuario** (las shares se mintean a la cuenta que firma). Nuestro círculo necesita que **el dinero del grupo** entre y salga del vault. Hay tres caminos; **no están verificados**, hay que probarlos en las primeras horas:

| Opción | Cómo funciona | Pros | Contras |
|---|---|---|---|
| **A. El contrato llama al vault** | El contrato del círculo invoca el vault de DeFindex directamente (llamada entre contratos). Las shares quedan a nombre del contrato | Lo más "Stellar": todo on-chain, sin confiar en nadie | Hay que leer la interfaz del vault de DeFindex (`deposit`/`withdraw`) y manejar la autorización; el más riesgoso |
| **B. Cuenta del círculo** | Cada círculo tiene una cuenta Stellar propia (multifirma) que firma los depósitos y retiros armados por el relayer | Usa Earn tal cual lo documenta Writz | Menos "sin confianza": quien controla las llaves controla la cuenta |
| **C. Modo demo con llave del círculo** | El contrato guarda aportes y reglas; una llave de administración del círculo ejecuta el depósito y el retiro en Earn (en testnet) | La más rápida de construir | La más débil en confianza; hay que decirlo con honestidad en el pitch |

**Regla de decisión:** hacer el **spike de la Opción A** (máximo 2-3 horas). Si funciona, seguir con A. Si no, pasar a B o C **sin dudar** y documentarlo claramente como limitación de testnet.

> En las 3 opciones lo que no cambia: el contrato de Cuotia guarda las reglas de turnos y aportes. Lo que cambia es **quién mueve el dinero hacia y desde Earn**.

### Cosas a tener en cuenta con el rendimiento
- El USDC de Earn en testnet es un token de prueba de Blend, así que **Cuotia debe usar ese mismo activo** para los aportes del demo (no el USDC de Circle).
- El APY es variable y en testnet puede ser bajo. En 4 días el rendimiento acumulado será **muy pequeño**.
- Para el demo: mostrar el **APY real** del endpoint y el **rendimiento real acumulado**, más una **proyección claramente etiquetada como simulación** (ejemplo: "con 10 personas aportando 50 USDC por 12 meses al APY actual, el rendimiento sería ~X"). Nunca presentar la proyección como dato real.
- Todo es testnet y **Writz no está auditado**: decirlo en el README.

---

## 4. Alcance del prototipo (solo lo esencial)

**Entra (MVP):**
1. Crear un círculo: nombre, monto de la cuota, periodicidad, lista de miembros (direcciones Stellar), orden de turnos.
2. Cada miembro **aporta** su cuota en USDC (Blend testnet) al contrato.
3. El contrato **invierte** el saldo ocioso en Earn.
4. En cada ronda, el contrato **retira de Earn** y **paga el bote** a quien le toca.
5. Pantalla de seguimiento: quién ha aportado, a quién le toca, saldo, APY y rendimiento.
6. Eventos y enlaces a Stellar Expert para cada transacción (evidencia para el jurado).

**Queda fuera (mencionar como siguiente paso):**
- Multas por atraso, invitaciones por teléfono o correo, wallets con passkey para quien no tiene wallet, salida de colones por SINPE Móvil (anchors), reputación, mainnet.

**Regla simple de reparto del rendimiento (propuesta, ajustable):** el bote de cada ronda es las cuotas + el rendimiento acumulado en esa ronda, y se lo lleva quien recibe el turno. Es fácil de explicar y de verificar.

---

## 5. Arquitectura

> El producto previsto incluye custodia y rendimiento on-chain. El estado del código cambia durante la implementación; para el estado actual, consulta `docs/arquitectura.md` y `docs/contrato-cuotia.md`.

```text
Navegador → app/ + components/ (Next.js App Router, desde la raíz)
   ├── API HTTP de Next.js: estado y consultas de Writz
   ├── Stellar Wallets Kit: conexión e identidad pública
   └── cliente Stellar → contrato Soroban (leer y enviar transacciones firmadas)

contracts/cuotia-v3/ → contrato Soroban de ahorros, compilado y desplegado por separado
```

**Responsabilidad de cada capa:**
- `app/`: páginas Next.js y endpoints HTTP; se ejecutan dentro de la misma aplicación.
- `components/`: interfaz y formularios; las operaciones de círculo se solicitan al contrato desde el navegador.
- `lib/wallet-client.mjs`: conexión a wallets Stellar; la wallet conserva las claves y firma las operaciones.
- `lib/cuotia-chain.mjs`: adaptador de lectura y escritura del contrato Soroban.
- `lib/writz-client.mjs`, `lib/writz-earn-route.mjs` y `lib/writz-earn.mjs`: consultas de APY/posición y transacciones personales de depósito/retiro firmadas por la wallet.
- `contracts/cuotia-v3/`: fuente Soroban de ahorros en Rust/Cargo, desplegada por separado de Next.js.
- `package.json`: dependencias y comandos npm de esta única app. No es un monorepo ni un coordinador de proyectos.

**Flujo de wallet implementado en el cliente:** Stellar Wallets Kit conecta la wallet y cada transacción de escritura pide firma. El contrato aún no está desplegado; hasta configurar sus direcciones, la web no persiste círculos localmente ni muestra datos simulados como compartidos.

**Interfaz actual del contrato:**

| Función | Estado |
|---|---|
| `create_circle(owner, token, name, frequency, members, contribution, rounds_total)` | Contrato de ahorros desplegado por separado; requiere validar en Testnet |
| `contribute(id, member)` | Registra el aporte de la persona por ronda |
| `advance_round(id)` | Cualquier cuenta abre la siguiente ronda cuando todas aportaron y se cumplió el periodo |
| `cancel_circle(id)` / `claim(id, member)` | Cancela una ronda incompleta después del periodo de gracia; cada persona reclama su total registrado |
| `get_circle(id)` / `list_circles(start_id, limit)` | Lectura de círculos públicos |
| Earn personal desde una wallet | Implementado para Testnet; pendiente validación end-to-end con una wallet financiada |
| Invertir/reclamar los fondos agrupados de un círculo en Writz | No implementado; requiere otro diseño de contrato y reglas de pérdidas/reembolsos |

**La interfaz no prueba seguridad on-chain.** Antes de uso compartido real se debe compilar y probar el contrato, verificar el token de Testnet y desplegarlo. Antes de fondos reales se debe auditar el sistema; Earn seguirá fuera del flujo hasta diseñar y verificar una integración segura.

---
## 6. Diseño de la web

**Objetivo:** que se sienta parte del ecosistema Stellar (como las webs de Stellar, APEX y Writz), pero con identidad propia de Cuotia.

### Antes de diseñar (la IA debe hacerlo primero)
1. Abrir y estudiar: **stellar.org**, la guía oficial de marca en **stellar.org/brand**, la página de **APEX** y **writz.xyz** (además de testnet.writz.xyz).
2. Extraer de ahí: paleta, tipografías, tamaños, espaciados, estilo de botones y de tarjetas, tono de la copia.
3. **No inventar valores ni asumir los colores de Stellar.** Los tokens de abajo son provisionales y se reemplazan por lo que se observe en esas webs.
4. **No usar el logo de Stellar ni de Writz como logo de Cuotia.** Se pueden mostrar como "Construido sobre Stellar" y "Rendimiento con Writz Earn", siguiendo sus reglas de uso.

### Dirección visual (propuesta)
- **Tema oscuro, sobrio y de mucho espacio**, con tipografía grande y limpia, bordes finos y pocos adornos.
- **Un solo color de acento** reservado para acciones importantes (aportar, confirmar).
- **El elemento memorable:** un **anillo de miembros** (el círculo). Cada miembro es un punto sobre el anillo; el turno actual se resalta y el anillo avanza cuando se paga una ronda. Es el "círculo de ahorro" hecho visual y es lo que se verá en el demo.
- Movimiento solo donde responde a una acción (aporte confirmado, turno que avanza). Nada de animaciones decorativas en cada sección.
- Accesible: contraste suficiente, foco visible con teclado, respeta "reducir movimiento", funciona bien en celular.

### Tokens provisionales (reemplazar tras estudiar las webs de Stellar)

| Token | Valor propuesto | Uso |
|---|---|---|
| `--fondo` | `#0B0C10` | Fondo general |
| `--superficie` | `#14161D` | Tarjetas y paneles |
| `--borde` | `#282B34` | Líneas finas |
| `--texto` | `#F3F4F7` | Texto principal |
| `--texto-suave` | `#A2A6AE` | Texto secundario |
| `--acento` | `#D7EC7A` | Acción principal y turno actual |

**Tipografía:** una sola familia sans moderna (por ejemplo Inter o similar, o la que use Stellar según su guía), en pocos pesos; títulos grandes con poco peso y cuerpo legible. Líneas de texto de menos de 80 caracteres.

### Pantallas

| Pantalla | Contenido | Acción principal |
|---|---|---|
| **Inicio** | Titular claro (qué es), el anillo animado con un círculo de ejemplo, APY real de Earn, "Construido sobre Stellar" | Crear un círculo |
| **Crear círculo** | Formulario corto: nombre, cuota, periodicidad, miembros, orden | Crear círculo |
| **Detalle del círculo** | Anillo, tabla de aportes de la ronda, a quién le toca, saldo en Earn, rendimiento acumulado | Aportar mi cuota |
| **Mi panel** | Mis círculos, mis próximos turnos y aportes pendientes | Abrir un círculo |

### Copy (voz y tono)
- Español simple, en minúsculas tras la primera letra, verbos claros y sin jerga.
- Botones que dicen exactamente lo que pasa: "Crear círculo", "Aportar 50 USDC", "Pagar turno".
- Estados consistentes: lo que el botón dice es lo que dice el aviso después ("Aportaste 50 USDC").
- Errores que explican qué pasó y cómo arreglarlo (por ejemplo: "No tienes USDC de prueba. Consíguelo en el faucet de Blend y vuelve a intentar").
- Nombre y lema: **Cuotia, círculos de ahorro que crecen mientras esperan.**
- Siempre visible: "Prototipo en Stellar testnet. No usar fondos reales."

---

## 7. Plan de trabajo por días

> La fecha de hoy es viernes 23 de octubre. Confirmar la hora de cierre de entregas (12:00 m.d. según el evento vs 3:00 PM según APEX); **planificar para entregar antes de las 12:00 del lunes**.

| Cuándo | Qué | Quién |
|---|---|---|
| **Vie 23 (kickoff 3 pm)** | Registrarse en APEX y formar equipo. Crear repo público. Conseguir wallets, XLM de testnet y USDC de prueba de Blend. Lanzar a la IA el **spike de Earn** (sección 8). Empezar a contactar gente para entrevistas | Humano + IA |
| **Vie noche** | Resultado del spike: elegir Opción A, B o C. Contrato base (crear círculo, aportar). Esqueleto del frontend | IA |
| **Sáb 24** | Mentorías 3 pm: preguntar dudas de Earn y de las reglas. Contrato completo + integración de Earn. Frontend: crear, detalle, aportar. **Hacer entrevistas.** **Último día para registrarse en APEX (11:30 pm)** | IA + humano |
| **Dom 25** | Pulir flujo completo, diseño final con el anillo y pruebas. Registrar la propuesta en APEX. Grabar el demo de prueba | IA + humano |
| **Lun 26 (mañana)** | Congelar el código, grabar pitch (3 min) y demo (2 min), llenar README, subir enlace del video a APEX, **entregar antes de las 12:00** | Humano |
| **Mié 28** | Gran final y premiación | Equipo |

**Punto de decisión:** si el domingo el flujo con Earn no funciona de punta a punta, **simplificar** (Opción C) y explicar claramente sus límites, en lugar de entregar algo roto.

---

## 8. Plan para la IA (empezar ya)

### Reglas generales
- Trabajar en un **repo público** con commits pequeños y frecuentes. Los commits deben mostrar la participación de cada integrante del equipo, así que **cada persona debe hacer commits con su propia cuenta de GitHub**.
- Todo en **testnet**. Nunca pedir ni usar llaves reales.
- **No inventar** interfaces de contratos ni endpoints: leer los docs y el código antes de usar algo. Si algo no está claro, escribirlo en `docs/NOTAS.md` con lo que se probó.
- Cada tarea termina con algo **ejecutable y probado** (prueba, script o captura), no solo código escrito.
- Documentar en el README qué es real y qué es simulado.

### Estructura del repositorio

```
cuotia/
├─ app/                     # páginas Next.js y API Route Handlers
├─ components/              # interfaz React
├─ lib/                     # cliente Stellar, Writz y pruebas
├─ contracts/cuotia-v3/      # contrato Soroban en Rust (toolchain aparte)
├─ docs/                    # decisiones, validación, pitch y arquitectura
├─ package.json              # única app Node/Next.js
└─ README.md                # cómo correrla y límites del prototipo
```

### Orden de tareas

| # | Tarea | Resultado esperado |
|---|---|---|
| 1 | **Spike de Earn personal** | El panel consulta APY/posición y prepara depósitos/retiros personales mediante XDR sin firmar del relayer; validar con wallets de Testnet |
| 2 | **Contrato base** | `crear_circulo`, `aportar`, `estado` con pruebas unitarias |
| 3 | **Earn para círculos agrupados** | Requiere diseño futuro de custodia, retiros, contabilidad de shares y reembolsos; no confundir con Earn personal |
| 4 | **Despliegue en testnet** | Contrato desplegado y configuración documentada para desarrollo y demo |
| 5 | **Frontend base** | Conectar wallet, crear círculo, ver estado, aportar |
| 6 | **Diseño** | Estudiar las webs de Stellar/APEX/Writz, definir tokens finales, implementar el anillo de miembros y las pantallas de la sección 6 |
| 7 | **Ciclo completo** | Un círculo de 3 cuentas de prueba que aporta, invierte, y paga los 3 turnos, con enlaces a Stellar Expert |
| 8 | **Pulido** | Estados de error, carga, celular, accesibilidad, textos |
| 9 | **Documentación** | README completo, arquitectura, límites, guion del pitch |

### Prompt maestro (copiar y pegar a la IA que construye)

```
Eres el equipo de ingeniería y diseño de "Cuotia", un proyecto para el Ideatón
Pura Vida (Stellar). Cuotia es una plataforma de círculos de ahorro (tandas):
un contrato Soroban guarda los aportes del grupo, reparte los turnos y
deposita el dinero ocioso en Writz Earn (vault DeFindex que presta en Blend)
en Stellar TESTNET.

Antes de escribir código:
1. Lee estas fuentes y resume en `docs/NOTAS.md` lo que necesitas saber:
   - https://docs.writz.xyz/products/earn.md
   - https://docs.writz.xyz/developers/request-for-startups.md
   - https://docs.writz.xyz/developers/quick-start.md
   - Repo WritzProtocol/writz: relayer/README.md,
     frontend/app/src/lib/flows/earn.ts,
     contracts/deployments/defindex-vault-testnet.md
   - Documentación de DeFindex (interfaz del vault: deposit/withdraw)
   - Documentación de Soroban y Stellar Wallets Kit
2. Haz primero el SPIKE: demuestra con un script que se puede depositar y
   retirar del vault de Earn (vault CBMHGL7GGGHODEDDJ5H2LKJEFHJWBRSQUKOXMC4FKOFDZK5HBKW6PI2S,
   activo: USDC de testnet de Blend). Prueba en este orden:
   A) el contrato Cuotia invoca al vault directamente (llamada entre contratos);
   B) una cuenta Stellar del círculo firma las transacciones que arma el relayer
      (POST https://api.testnet.writz.xyz/defindex/deposit y /withdraw);
   C) una llave de administración del círculo ejecuta el depósito y retiro.
   Quédate con la primera que funcione y documenta por qué en `docs/NOTAS.md`.

Reglas:
- Solo testnet. Nunca uses llaves reales ni pidas secretos.
- No inventes funciones, endpoints ni parámetros: si no los confirmaste en la
  documentación o en el código, pruébalos y anota el resultado.
- Commits pequeños con mensajes claros. Cada tarea termina con algo ejecutable
  y probado.
- En el README marca claramente qué es real y qué es simulado (por ejemplo,
  proyecciones de rendimiento) y que Writz no está auditado.

Producto (MVP): crear círculo (cuota, periodicidad, miembros, orden), aportar,
invertir en Earn, pagar el turno, y una pantalla de seguimiento con APY y
rendimiento real.

Diseño: antes de diseñar, estudia stellar.org, stellar.org/brand, la página de
Stellar APEX y writz.xyz; extrae paleta, tipografía y estilo, y define los
tokens a partir de lo observado (no asumas colores). Tema oscuro, sobrio,
un solo color de acento. Elemento memorable: un anillo de miembros que
avanza al pagar cada turno. No uses logos de Stellar ni de Writz como logo
propio. Copy en español simple, botones con verbos claros, errores que
explican cómo arreglarlos. Accesible y responsivo.

Entrega: sigue el orden de tareas de `docs/plan-cuotia.md` (sección 8) y avísame
al terminar cada una con evidencia (salida de pruebas, hashes de transacciones
en Stellar Expert o capturas).
```

---

## 9. Lo que NO puede hacer la IA (lo hace una persona)

- **Entrevistas de validación** (la validación pesa 20-22%): mínimo 10, con preguntas como "¿has participado en una tanda?", "¿cuánto aportan y cada cuánto?", "¿alguna vez alguien se fue con el bote?", "¿cuánto tiempo está parada la plata?".
- Registrarse en **APEX** antes del sábado 24 a las 11:30 pm y cargar la propuesta.
- Crear **wallets de prueba** y fondear con XLM y USDC de testnet.
- Hacer **commits con la cuenta de GitHub de cada integrante**.
- **Grabar el pitch (3 min) y el demo (2 min)** y subir el enlace a APEX.
- Preguntar en Discord/mentorías de Writz si el camino elegido para Earn es válido.

---

## 10. Estructura del pitch (3 min) y del demo (2 min)

**Pitch (3 min):**
1. **Problema (40 s):** en las tandas el organizador custodia la plata y el dinero espera parado. Cuenta una historia real de las entrevistas.
2. **Evidencia (30 s):** cuántas personas entrevistadas, qué dijeron, un dato fuerte.
3. **Solución (40 s):** Cuotia en una frase y por qué necesita Stellar (Soroban, USDC, comisiones mínimas).
4. **Writz Earn (30 s):** explicar que las personas pueden usar Earn desde sus propias wallets en Testnet; los fondos de círculos no se depositan ni se prometen rendimientos.
5. **Negocio (30 s):** a quién le sirve, cómo gana Cuotia, cómo se diferencia.
6. **Siguiente paso (10 s):** anchors para retirar en colones (SINPE), invitar sin wallet, mainnet.

**Demo (2 min):** un círculo de 3 cuentas: crear, aportar y reclamar al completar; mostrar una operación de Earn personal por separado si el tiempo lo permite.

---

## 11. Entregables y checklist final

- [ ] Propuesta de solución registrada en APEX
- [ ] Repo público de GitHub con README, IDs de contrato y límites
- [ ] Commits de **todos** los integrantes dentro de las fechas del evento
- [ ] Prototipo desplegado y funcionando en testnet
- [ ] Evidencia de la integración con Writz: IDs de contrato y hashes de transacciones
- [ ] Documento de validación (entrevistas, capturas sin datos personales)
- [ ] Pitch (3 min) + demo (2 min) grabados, enlace cargado en APEX
- [ ] Entrega **antes de las 12:00** del lunes 26 de octubre

---

## 12. Riesgos y qué hacer

| Riesgo | Plan |
|---|---|
| Earn no funciona con un contrato como depositante | Opción B o C, dicho con honestidad en el pitch |
| El rendimiento en testnet es casi cero | Mostrar APY real + proyección etiquetada como simulación |
| Falta de tiempo en el diseño | Dejar el anillo para el final; primero un diseño oscuro simple y funcional |
| Pocas entrevistas | Empezar hoy; las entrevistas por WhatsApp de 5 minutos bastan |
| Solo un depósito de prueba funciona | Mostrar el ciclo completo con 3 cuentas grabado antes del lunes |
| Hora de cierre incierta (12:00 vs 3:00 PM) | Entregar antes de las 12:00 |
| El nombre "Cuotia" ya está tomado | Revisar dominio y GitHub hoy; alternativa: "Cuotia CR" |

---

## 13. Pendientes por confirmar

- [ ] ¿Se puede inscribir más de un proyecto por equipo? (preguntar en el kickoff)
- [ ] Cuántas personas hay en el equipo y quién entrevista
- [ ] Hora exacta de cierre de entregas
- [ ] Interfaz exacta del vault de DeFindex (depósito y retiro desde un contrato)
- [ ] Cuerpo de las peticiones del relayer (`/defindex/deposit` y `/withdraw`)
- [ ] Dominio y repo disponibles para "Cuotia"
- [ ] Tokens de diseño finales tras estudiar stellar.org, APEX y Writz
