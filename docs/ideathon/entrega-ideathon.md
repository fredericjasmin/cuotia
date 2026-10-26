# Entrega de la Ideatón Pura Vida

> Todo el material de la entrega de Cuotia: pitch, demo, publicación y checklist final. Complementa `ideaton-pura-vida.md` (reglas de la competencia).

## Índice del material

| Material | Ubicación | Qué es |
|---|---|---|
| Deck del pitch (9 slides) | `pitch/presentation.html` | Abrir en navegador, F11, navegar con flechas. Acepta `?frame=1&slide=N` para ver un slide sin interfaz |
| Guion del pitch (3 min) | `pitch/guion.md` | Palabra por palabra con tiempos y tips de grabación |
| Frames del pitch | `pitch/frames/slide-1.png` … `slide-9.png` | Los 9 slides en PNG 1920x1080, listos para el editor de video |
| Tarjetas de título | `pitch/frames/card-pitch.png` y `card-demo.png` | Portadas "Pitch" y "Demo" en PNG 1920x1080 |
| Fuente de las tarjetas | `pitch/cards.html` | Editable; re-sacar captura con Edge headless |
| Imágenes del deck | `pitch/tanda.png`, `pitch/cuotia-home.png`, `pitch/fredericjasmin.jpg`, `pitch/brand-coin.png` | Foto de manos, screenshot de la home, foto de perfil, moneda de marca |

## Nombre del video

- Archivo que se sube: `Cuotia — Pitch y Demo, Pura Vida Ideathon`
- Título editorial (si la plataforma pide uno aparte): `Cuotia: el círculo de ahorro de tu familia, ahora en la blockchain`

## Orden del video final

1. Tarjeta `card-pitch.png` (2 segundos)
2. Los 9 slides del pitch con voz encima (guion de `pitch/guion.md`, ~2:50)
3. Tarjeta `card-demo.png` (2 segundos)
4. Demo grabada a pantalla completa con voz (~2 min)
5. Cierre: `slide-9.png` o pantalla de la web quieta, mientras dice "gracias"

## Demo: qué grabar

Grabación de pantalla a 1920x1080 (OBS). Sin tiempos muertos: cortar cada espera en la edición.

1. Crear el círculo: nombre real, 10 USDC, semanal, 2 miembros
2. Firma en la wallet: mostrar el popup de confirmación (se ve que el usuario controla)
3. Aporte del segundo miembro
4. El momento estrella: "Vault value today (+X% vs contributed)" y el detalle por miembro ("now X in vault")
5. "Recent Stellar activity" con los eventos on-chain y links a stellar.expert
6. (Si da tiempo) aprobar Writz Earn y ver el consenso 2 de 2

Condiciones antes de grabar: wallet con XLM y Blend USDC, círculo de respaldo ya creado por si Testnet se pone lenta, audio grabado aparte leyendo el guion.

## Publicación en X

No hay campo de título aparte: el texto del tweet es el título (límite 280 caracteres).

Texto del tweet principal (video del pitch + demo adjunto):

```
Pitch y demo de Cuotia para la #PuraVidaIdeathon: las tandas de ahorro sobre Stellar. Reglas en contrato inteligente, cada quien firma su aporte y nadie custodia el dinero de otro.
@StellarOrg @StarMaker_LATAM @TheBAFNetwork @AsoBlockchainCR
```

Respuesta al propio tweet con el link (los links en el tweet principal bajan el alcance):

```
Pruébenlo en vivo en Stellar Testnet: https://cuotia-fj.vercel.app
```

Cuentas a etiquetar: `@StellarOrg`, `@StarMaker_LATAM`, `@TheBAFNetwork`, `@AsoBlockchainCR`. Hashtag oficial: `#PuraVidaIdeathon`.

## Checklist final

- [ ] Video: pitch + demo en un solo archivo, audio fuerte y claro en celular
- [ ] Primeros 3 segundos del video con movimiento o "Cuotia" grande en pantalla
- [ ] Tweet publicado con video nativo (no link externo), texto de arriba, menciones incluidas
- [ ] Tweet fijado en el perfil
- [ ] Reply con el link de la demo
- [ ] Sitio desplegado apuntando al contrato vigente y con el círculo de demo creado
- [ ] Wallet de demo con fondos (XLM + Blend USDC) por si hay presentación en vivo
- [ ] Ensayo del guion con cronómetro: máximo 3:10

## Notas de estado técnico (al día de la entrega)

- Contrato vigente en Testnet: `CBNPB3S542LAA7BC6X23DFSPI5LJPFRXV6ZEAMIOWLYGPUC6S5YGGF4M` (fuente: `contracts/cuotia-v3`, redeployado con eventos)
- El historial de actividad lee eventos del RPC con ventana de 9,500 ledgers (límite del RPC: 10,000)
- El deck del pitch vive en el repo bajo `pitch/`; no forma parte de la app web
