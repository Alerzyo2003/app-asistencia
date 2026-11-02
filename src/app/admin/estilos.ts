/**
 * Clases de Tailwind compartidas por los formularios del panel.
 *
 * Los campos usan text-base en el teléfono: con menos de 16 px, el iPhone hace
 * zoom a la pantalla cada vez que se toca un campo. Los botones miden al menos
 * 44 px de alto para poder tocarlos con el dedo.
 */

export const campo =
  "w-full min-w-0 rounded-xl border border-tinta-300 bg-white px-3 py-2.5 text-base outline-none focus:border-turquesa-500 focus:ring-2 focus:ring-turquesa-200 disabled:bg-tinta-100 disabled:text-tinta-500 md:py-2 md:text-sm";

export const etiqueta = "text-xs font-medium text-tinta-600";

export const tarjeta = "rounded-3xl bg-white p-4 shadow-sm ring-1 ring-tinta-200 sm:p-5";

const boton =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 md:min-h-0";

export const botonPrimario = `${boton} bg-noche-900 text-white hover:bg-noche-700`;

export const botonSecundario = `${boton} border border-tinta-300 bg-white text-tinta-700 hover:bg-tinta-50`;

export const botonPeligro = `${boton} border border-carmin-300 bg-white text-carmin-700 hover:bg-carmin-50`;

/** Botón a todo el ancho en el teléfono y de su tamaño natural desde sm. */
export const anchoMovil = "w-full sm:w-auto";

// ---------------------------------------------------------------------------
// Tablas: en el computador son tablas; en el teléfono cada fila se vuelve una
// ficha. Se usa una sola estructura HTML, así no se dibujan los datos dos veces.
// ---------------------------------------------------------------------------

export const cajaTabla = "overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-tinta-200";

export const tabla = "block w-full text-left text-sm md:table";

export const cabeceraTabla = "hidden bg-tinta-50 text-xs text-tinta-500 md:table-header-group";

export const cuerpoTabla = "block divide-y divide-tinta-100 md:table-row-group";

/** Nombre de la columna, visible solo cuando la fila es una ficha. */
export const rotuloMovil = "block text-xs text-tinta-500 md:hidden";
