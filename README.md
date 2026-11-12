# SVOLTS · Ingeniería Solar — Versión 3

Landing page corporativa y **Simulador de Celdas Solares** (HTML + CSS + JavaScript, sin dependencias ni backend).
Estilo visual: formas planas y redondeadas (flat vector), color en bloques, profundidad 3D discreta y paleta de marca SVOLTS
(#0B1F3A, #2473B8, #F5A623, #FFFFFF, #F4F7FA, #172536).

**Desarrollado por:** Rodrigo Espada · Ingeniería Industrial · Tecnológico de Monterrey · Matrícula: pendiente de proporcionar.
Proyecto académico del estudiante; no es una publicación oficial ni cuenta con el respaldo de la institución.

## Novedades de la versión 3 · Laboratorio Solar Interactivo

Nueva página `laboratorio.html` (también enlazada desde la sección **Laboratorio Solar Interactivo** de la landing)
con un selector entre tres simulaciones (`#espectro`, `#fotoelectrico`, `#celda`) y botones para volver al
laboratorio o a la página principal.

| Simulación | Qué hace | Modelo y datos |
|---|---|---|
| Espectro solar | Irradiancia espectral (W/m²/nm) contra λ (nm) con regiones UV/visible/IR, colores del visible, lectura con el cursor, selección por clic, teclado, λ o f, control de irradiancia, vista terrestre/extraterrestre/comparar, energía del fotón en J y eV, onda electromagnética animada e integrales por región. | **ASTM G173-03** tabulado (AM0, AM1.5 global 37°, AM1.5 directa) de NREL/SMARTS v2.9.2, tomado de `pvlib-python`. Cuerpo negro de 5772 K con la ley de Planck, marcado como modelo. E = hc/λ, f = c/λ con constantes SI exactas. |
| Efecto fotoeléctrico | Cámara de vacío en Canvas con fuente, fotones, cátodo, ánodo, electrones, fuente variable, voltímetro y amperímetro. Controles de λ, f, intensidad, material, voltaje, pausa y reinicio. Gráficas I-V y Kmax-f. | Kmax = hf − Φ; emisión solo si hf ≥ Φ; V₀ = Kmax/e. Corriente I = e·Y·(P/hf)·η_col con rendimiento cuántico supuesto Y = 10⁻³ y recolección 1 − e\|V\|/Kmax para V < 0. Φ: Cs 2.1, K 2.29, Na 2.36, Zn 4.3, Cu 4.7 eV (HyperPhysics/CRC y LibreTexts; se muestran los rangos reportados). |
| Celda fotovoltaica | Corte p-n animado: capa n, región de agotamiento con iones y campo, capa p, contactos, circuito externo y carga. Modo de comparación con el efecto fotoeléctrico. | Absorción si E ≥ Eg (Si 1.12, GaAs 1.42, Ge 0.66 eV a 300 K); termalización E − Eg; λc = hc/Eg; corriente máxima y eficiencia última con AM1.5G. |

Mejoras al simulador solar:
- **Modo básico** ahora calcula también **por número de paneles** (potencia instalada, generación diaria, mensual
  y anual con HSP y factor de rendimiento editable), además de por consumo.
- **Modo avanzado**: los datos del módulo pueden venir del catálogo o capturarse a mano (Voc, Isc, Vmp, Imp,
  coeficiente de Voc) y se validan (Vmp < Voc, Imp < Isc, Pmax ≈ Vmp·Imp, factor de forma, coeficiente).

### Archivos nuevos

```
laboratorio.html  laboratorio.css  laboratorio.js   ← página, estilos e infraestructura (navegación, animación, validación)
lab-core.js                                         ← motor de física (funciones puras, probadas en Node)
lab-espectro.js  lab-fotoelectrico.js  lab-celda.js ← las tres simulaciones
data/astm-g173.js                                   ← espectros ASTM G173-03 tabulados (280–4000 nm)
tests/calc.test.js  tests/lab.test.js               ← pruebas: node tests/calc.test.js && node tests/lab.test.js
```

Accesibilidad: todas las simulaciones se controlan con teclado, las animaciones tienen pausa, se detienen fuera de
pantalla y arrancan en pausa con `prefers-reduced-motion`. No hay dependencias externas ni backend.

## Novedades de la versión 2

- La landing (`index.html`) abre directo en la portada, con el logo horizontal arriba a la izquierda y el botón
  destacado **"Simulador de Celdas Solares"** (también en la barra como "Simulador C.S.").
- Nueva sección **Cotización** con tres opciones: estimación rápida, análisis de voltaje y corriente y cotización completa.
- El simulador tiene dos modos:
  - **Básico**: consumo del recibo (mensual o bimestral), precio del kWh, HSP y panel → paneles necesarios,
    kWp, generación mensual, cobertura, ahorro anual y costo de los paneles.
  - **Avanzado**: curva **I-V** y **P-V** del arreglo (irradiancia, temperatura, NOCT, coeficientes, módulos en
    serie y cadenas en paralelo, carga resistiva o seguidor MPPT), más los seis pasos de la cotización completa.
- Autoría visible en la portada del simulador y en el pie de ambas páginas.
- Todos los cálculos son síncronos y locales: se actualizan al escribir o mover un control.

## Estructura

```
SVOLTS/
├── index.html          ← landing page
├── styles.css
├── script.js
├── simulador.html      ← Simulador de Celdas Solares (modos básico y avanzado)
├── simulador.css
├── simulador.js        ← interfaz del simulador
├── calc.js             ← motor de cálculo (funciones puras, sin DOM)
├── catalogo.js         ← catálogo base de productos reales
├── README.md
└── assets/
    ├── logo-horizontal.png ← logo de la barra superior (reemplázalo por el oficial, mismo nombre)
    ├── logo.png            ← logo de la placa del Hero
    ├── favicon.svg
    ├── fonts/            ← Space Grotesk y Manrope, autoalojadas
    ├── images/
    └── models/
```

## Logotipo

`assets/logo-horizontal.png` es el logo de la esquina superior izquierda (barra de navegación de la
landing y del simulador) y del pie de página. Para usar el logotipo oficial, sustituye ese archivo por tu PNG
horizontal con el mismo nombre. Se muestra con altura fija y ancho automático, así que conserva sus proporciones.
`assets/logo.png` se usa en la placa del Hero.
Está pensado para fondos claros (la barra y el pie son claros).

## Ejecutar en local

Opción A: abre `index.html` con doble clic (el simulador también funciona así, aunque algunos navegadores restringen `localStorage` en archivos locales).

Opción B (recomendada), servidor local:

```bash
cd SVOLTS
python3 -m http.server 8000
# abre http://localhost:8000
```

## Publicar en GitHub Pages

Este repositorio (`landingpage`) ya tiene `index.html` en la raíz.

1. En el repositorio: **Settings → Pages → Build and deployment**.
2. En **Source** elige **Deploy from a branch**, selecciona la rama `main` y la carpeta `/ (root)`, y guarda.
3. En uno o dos minutos el sitio estará en `https://a01742679-byte.github.io/landingpage/`.

Todas las rutas son relativas, por lo que funciona tanto en la raíz de un dominio como en un subdirectorio.

## Interacciones implementadas

- **Navegación**: barra fija que se compacta al desplazar, indicador de sección activa (punto que se desliza), desplazamiento suave, menú hamburguesa funcional en móvil.
- **Hero**: isla flotante isométrica con sistema fotovoltaico (SVG generado en JS) en capas con profundidad CSS 3D. Cambia la perspectiva con el cursor; en táctil se gira deslizando. Profundidad al desplazar la página.
- **Servicios**: composición modular con tarjetas de distinto tamaño; cada una abre un panel (modal accesible) con qué hacemos, qué evaluamos y qué entregamos, con navegación anterior/siguiente.
- **Ingeniería**:
  - *Sistema*: diagrama con flujo animado; selecciona un componente para ver función, características y relaciones; alterna Día/Noche para ver cómo cambia el sentido del flujo.
  - *Conexiones*: alterna serie/paralelo y observa cómo cambia el esquema (solo visual, sin valores eléctricos).
  - *Panel solar*: modelo 3D que se gira arrastrando, con botones o con el teclado; vista explosionada por capas.
- **Metodología**: línea de proceso de cuatro etapas (hover, foco o clic); en móvil es una secuencia vertical.
- **Beneficios**: lista enlazada con una órbita que resalta el principio activo.
- **Sostenibilidad**: bloques ODS 07 y ODS 12 con ilustraciones geométricas y detalle desplegable.
- **General**: aparición al desplazar, estados de foco visibles, botón de volver arriba con anillo de progreso, `prefers-reduced-motion` respetado.

## Simulador solar (`simulador.html`)

Aplicación autocontenida: no usa base de datos ni servidor. Los cálculos corren en el navegador y el
estado (proyecto y catálogo) se guarda en `localStorage`.

Modo básico (`simulador.html#basico`): estimación rápida descrita arriba.

Modo avanzado: **Curva I-V → Consumo → Paneles → Inversor → Baterías → Economía → Reporte**, más una pestaña **Catálogo**.

| Módulo | Qué calcula |
|---|---|
| Curva I-V | Modelo explícito de un diodo con Voc, Isc, Vmp e Imp de la ficha; corrección por irradiancia y temperatura de celda (NOCT); V = Ns·V_módulo, I = Np·I_módulo; punto de máxima potencia, factor de forma, punto de operación con carga R (I = V/R) o con MPPT; tabla de puntos. |
| Consumo | Potencia, energía diaria/anual y corriente (I = P/V) por equipo; demanda simultánea. |
| Paneles | P_fv = E_dia / (HSP × PR); nº de paneles; serie/paralelo con corrección por temperatura (Voc en frío, Vmp en calor); caída de tensión en el cable (ley de Ohm). |
| Inversor | Pruebas contra la ficha: voltaje máx., ventana MPPT, nº de cadenas, corriente por MPPT, cortocircuito, potencia FV máx., relación CD/CA, demanda. |
| Baterías | Energía nominal y útil, módulos en serie/paralelo, corriente de descarga y carga, autonomía en días y horas. |
| Economía | Inversión (equipo + instalación + IVA opcional), ahorro anual, retorno con degradación, tarifa y mantenimiento, gráfica a 25 años. |
| Reporte | Propuesta A4 con resumen para cliente no especialista, verificaciones, inversión, retorno, supuestos y fuentes. Se descarga con "Descargar PDF" (imprimir → Guardar como PDF). |
| Catálogo | Alta, edición y baja de productos con marca, modelo, especificaciones, precio, proveedor, enlace, ficha técnica y fecha de consulta; exportar/importar JSON. |

### Catálogo base

`catalogo.js` incluye 5 productos consultados el 6 de noviembre de 2026 en Proveedor Solar (Guadalajara):
2 paneles (JA Solar 620 W, LONGi 620 W), 2 inversores (Growatt MIN 10000TL-X2 y SPF 6000T DVM-MPV) y
1 batería (Pylontech US5000). Las especificaciones eléctricas vienen de las fichas de los fabricantes
(enlace en cada producto). Ninguna tienda indicó si el precio incluye IVA. Revisa y vuelve a consultar
precios y existencias antes de cotizar. Donde una ficha era ambigua se anota en el campo de notas.

Para agregar modelos más pequeños (por ejemplo un inversor de 3 a 5 kW), usa **Catálogo → Agregar producto**.

### Pruebas del motor de cálculo

`calc.js` es un módulo sin dependencias. Se puede probar con Node: `node -e "const C=require('./calc.js'); console.log(C.pvRequirement({energyDayWh:9304,hsp:5.5,pr:0.75,panelW:620}))"`.

## Veracidad y alcance

El sitio corporativo (`index.html`) no incluye clientes, proyectos, precios, porcentajes, certificaciones,
testimonios ni datos de contacto, y sus visualizaciones son educativas.

El simulador entrega un **dimensionamiento y una cotización preliminares**, no un proyecto ejecutivo
autorizado para construcción. Los valores de HSP, PR, tarifa, instalación, días de uso y equipos del aula
precargados son **ejemplos editables**. El responsable debe verificar los resultados, la compatibilidad
eléctrica y los supuestos antes de ofrecerlos a un cliente.
