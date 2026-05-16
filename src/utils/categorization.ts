// Palabras clave para categorización automática
// Formato: [PALABRA_CLAVE]: tipo_de_categoría
// Se busca coincidencia parcial en la descripción (case-insensitive)

export const CATEGORY_KEYWORDS: Record<string, string> = {
  // Necesidades (needs)
  'SUPERMERCADO': 'needs',
  'MERCADONA': 'needs',
  'GROCERIES': 'needs',
  'MERCADONA GROCERIES': 'needs',
  'CARREFOUR': 'needs',
  'LIDL': 'needs',
  'ALCAMPO': 'needs',
  'DIA': 'needs',
  'COMIDA': 'needs',
  'HIPERCOR': 'needs',
  'SUPER': 'needs',
  'ALIMENTACION': 'needs',
  'COMER': 'needs',
  'RESTAURANTE': 'needs',
  'BAR': 'needs',
  'CAFE': 'needs',
  'PANADERIA': 'needs',
  'FRUTERIA': 'needs',
  'PESCADORIA': 'needs',
  'CARNICERIA': 'needs',
  'GASOLINERA': 'needs',
  'REPSOL': 'needs',
  'CEPSA': 'needs',
  'BP': 'needs',
  'SHELL': 'needs',
  'TRANSPORTE': 'needs',
  'TAXI': 'needs',
  'UBER': 'needs',
  'CABIFY': 'needs',
  'METRO': 'needs',
  'BUS': 'needs',
  'TREN': 'needs',
  'RENTE': 'needs',
  'AGUA': 'needs',
  'LUZ': 'needs',
  'GAS': 'needs',
  'ELECTRICIDAD': 'needs',
  'IBI': 'needs',
  'HIPOTECA': 'needs',
  'ALQUILER': 'needs',
  'COMUNIDAD': 'needs',
  'BASURA': 'needs',
  'INTERNET': 'needs',
  'TELEFONO': 'needs',
  'MOVIL': 'needs',
  'VODAFONE': 'needs',
  'ORANGE': 'needs',
  'MIROTEL': 'needs',
  'MÉDICO': 'needs',
  'FARMACIA': 'needs',
  'HOSPITAL': 'needs',
  'DENTISTA': 'needs',
  'COLEGIOS': 'needs',
  'EDUCACION': 'needs',
  'ROPAS': 'needs',
  'ZAPATOS': 'needs',
  'HIGIENE': 'needs',

  // Ocio (leisure)
  'NETFLIX': 'leisure',
  'SPOTIFY': 'leisure',
  'HBO': 'leisure',
  'DISNEY': 'leisure',
  'AMAZON PRIME': 'leisure',
  'YOUTUBE': 'leisure',
  'CINE': 'leisure',
  'TEATRO': 'leisure',
  'CONCIERTO': 'leisure',
  'FESTIVAL': 'leisure',
  'DEPORTES': 'leisure',
  'GYM': 'leisure',
  'GIMNASIO': 'leisure',
  'FITNESS': 'leisure',
  'VIDEOJUEGOS': 'leisure',
  'STEAM': 'leisure',
  'PLAYSTATION': 'leisure',
  'XBOX': 'leisure',
  'LIBROS': 'leisure',
  'MÚSICA': 'leisure',
  'VIAJES': 'leisure',
  'HOTEL': 'leisure',
  'VUELOS': 'leisure',
  'RYANAIR': 'leisure',
  'IBERIA': 'leisure',
  'VUELING': 'leisure',
  'DISCOTECA': 'leisure',
  'COPAS': 'leisure',

  // Ahorro (savings)
  'AHORROS': 'savings',
  'INVERSION': 'savings',
  'BOLSA': 'savings',
  'FONDO': 'savings',
  'DEPOSITO': 'savings',
  'PLAN DE PENSIONES': 'savings',
  'JUBILACION': 'savings',

  // Otros (other)
  'REGALO': 'other',
  'DONACION': 'other',
  'CARIDAD': 'other',
  'MULTA': 'other',
  'TRAMITES': 'other',
  'LEGAL': 'other',
  'ABOGADO': 'other',
  'NOTARIO': 'other',
  'BANCO': 'other',
  'COMISION': 'other',
  'TRANSFERENCIA': 'other',
};

/**
 * Detecta la categoría basándose en la descripción
 * @param description - La descripción de la transacción
 * @param categories - Lista de categorías del usuario
 * @returns El ID de la categoría detectada o null
 */
export function detectCategory(
  description: string,
  categories: Array<{ id: string; name: string; type: string }>
): string | null {
  const normalizedDesc = description.toUpperCase().trim();

  // Buscar coincidencia con palabras clave
  for (const [keyword, categoryType] of Object.entries(CATEGORY_KEYWORDS)) {
    if (normalizedDesc.includes(keyword)) {
      // Buscar cualquier categoría del usuario que coincida con este tipo
      const userCategory = categories.find(cat => cat.type === categoryType);
      if (userCategory) {
        return userCategory.id;
      }
    }
  }

  return null;
}
