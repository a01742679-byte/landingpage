/* ==========================================================================
   SVOLTS · Simulador solar — catálogo base (datos locales)
   Cada producto fue consultado el 6 de noviembre de 2026 en la tienda indicada.
   - Los precios son los que mostraba la página, en MXN. Ninguna página indicó
     si el precio incluye IVA: confírmalo con el proveedor antes de cotizar.
   - Las especificaciones eléctricas vienen de la ficha técnica citada en
     "specsUrl", no de la tienda. Donde hay una duda, se anota en "notes".
   - Puedes editar, borrar o agregar productos desde la pestaña "Catálogo".
   ========================================================================== */
window.SV_CATALOG_VERSION = 1;
window.SV_CATALOG_SEED = [
  {
    id: 'panel-ja-620',
    cat: 'panel',
    brand: 'JA Solar',
    model: 'JAM72D42-620/LB',
    title: 'Panel Solar JA Solar N-Type Bifacial de 620 W',
    price: 3800.80,
    supplier: 'Proveedor Solar (Guadalajara, Jalisco)',
    url: 'https://proveedorsolar.com/productos/JAM72D42620LB/',
    consulted: '2026-11-06',
    stock: 'La tienda indicaba 99 piezas',
    specsUrl: 'https://www.solarproof.com.au/products/JAM72D42-620LB.php',
    pmax: 620, voc: 52.07, isc: 15.11, vmp: 43.51, imp: 14.25,
    tcVoc: -0.26,
    dims: '2465 × 1134 mm',
    notes: 'La tienda no publica la ficha eléctrica; los valores STC y el coeficiente de Voc vienen de la ficha del fabricante citada. No encontré el coeficiente de Isc ni el peso.'
  },
  {
    id: 'panel-longi-620',
    cat: 'panel',
    brand: 'LONGi',
    model: 'LR7-72HTH-620M (Hi-MO X6 Max Anti-Dust)',
    title: 'Panel Solar Longi 620 W Hi-Mo X6 MAX Anti-Dust',
    price: 3175.06,
    supplier: 'Proveedor Solar (Guadalajara, Jalisco)',
    url: 'https://proveedorsolar.com/productos/LR772HTHF620M-ANTIDUST/',
    consulted: '2026-11-06',
    stock: 'La tienda indicaba 1 pieza: confirma existencias',
    specsUrl: 'https://adjditec.com/en/products/longi-lr7-72hth-620w-hi-mo-x6-max-silver-f-mc4-1500v',
    pmax: 620, voc: 52.72, isc: 14.93, vmp: 44.48, imp: 14.0,
    tcVoc: -0.23,
    dims: 'No indicadas en la fuente',
    notes: 'Especificaciones tomadas de la ficha de un distribuidor europeo para el LR7-72HTH-620M. La tienda mexicana vende la variante Anti-Dust: confirma que los datos eléctricos coinciden.'
  },
  {
    id: 'inv-min10000-x2',
    cat: 'inversor',
    brand: 'Growatt',
    model: 'MIN 10000TL-X2',
    title: 'Inversor Growatt de 10 kW, 2 fases a 240 V, 3 MPPT con antena Wifi integrada',
    price: 24259.62,
    supplier: 'Proveedor Solar (Guadalajara, Jalisco)',
    url: 'https://proveedorsolar.com/productos/GRWMIN10000TLX2/',
    consulted: '2026-11-06',
    stock: 'Listado como disponible (precio visto en el listado de la categoría)',
    specsUrl: 'https://latam.growatt.com/upload/file/MIN_7000-10000TL-X2_Manual_de_usuario_MX.pdf',
    type: 'interconectado',
    pacW: 10000, vdcMax: 600, mpptMin: 60, mpptMax: 550,
    nMppt: 3, stringsPerMppt: 1,
    impMax: 16, iscMax: 24, pdcMax: 15000,
    acOut: '220/230/240 V CA',
    notes: 'Corriente máxima por MPPT: la hoja de datos de un distribuidor indica 16 A y el manual de Growatt Latinoamérica indica 18 A; se usa 16 A (el valor más conservador). Es un inversor interconectado: no incluye almacenamiento. Es grande para un aula: la relación paneles/inversor saldrá baja. Agrega un modelo menor si lo necesitas.'
  },
  {
    id: 'inv-spf6000t',
    cat: 'inversor',
    brand: 'Growatt',
    model: 'SPF 6000T DVM-MPV',
    title: 'Inversor cargador de 6 kW a 48 VDC, salida split phase 120/240 VAC, conexión CANBUS',
    price: 33054.30,
    supplier: 'Proveedor Solar (Guadalajara, Jalisco)',
    url: 'https://proveedorsolar.com/productos/GRWSPF6000T-DVMMPV/',
    consulted: '2026-11-06',
    stock: 'Señales contradictorias: la ficha de la tienda decía "solo quedan 1" y el carrito indicaba sin existencias',
    specsUrl: 'https://cdn.shopify.com/s/files/1/0689/8856/7843/files/SPF_6_12k_T_DVM-US_MPV_Datasheet_ROCKSOLAR.pdf',
    type: 'aislado48',
    pacW: 6000, vdcMax: 250, mpptMin: 60, mpptMax: 245,
    nMppt: 2, stringsPerMppt: 1,
    impMax: null, iscMax: null, pdcMax: 5000,
    vbat: 48, iChargePvMax: 60,
    acOut: '120/240 V CA (fase partida)',
    notes: 'Datos tomados de la hoja de la versión DVM-US MPV. La tabla del PDF se leyó con orden poco claro: confirma la potencia FV máxima (5000 W) y la corriente de carga solar (60 A). La ficha no da la corriente máxima por MPPT. Su salida es 120/240 V; verifica que las cargas del aula (127 V) sean compatibles.'
  },
  {
    id: 'bat-us5000',
    cat: 'bateria',
    brand: 'Pylontech',
    model: 'US5000',
    title: 'Batería de litio Pylontech US5000, módulo de 4.8 kWh a 48 V',
    price: 51314.14,
    supplier: 'Proveedor Solar (Guadalajara, Jalisco)',
    url: 'https://proveedorsolar.com/productos/PYLONUS5000/',
    consulted: '2026-11-06',
    stock: 'La tienda indicaba 12 piezas',
    specsUrl: 'https://cdn.shopify.com/s/files/1/0809/2316/5014/files/us5000-datasheet.pdf',
    vnom: 48, kwh: 4.8, dod: 0.95, irec: 80, imax: 100, cycles: 6000,
    dims: '442 × 420 × 161 mm, 39.7 kg',
    notes: 'La ficha indica 4.8 kWh nominales y 4.56 kWh utilizables (95 %), corriente recomendada 80 A y máxima continua 100 A, más de 6000 ciclos a 25 °C. La página de la tienda solo muestra el título "Bater" y el código PYLONUS5000.'
  }
];
