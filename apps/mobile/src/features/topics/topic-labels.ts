/**
 * Spanish names of the content topics (the `topic` slug of a lesson or a study card), for the
 * lesson index and the "Fichas".
 */
const TOPIC_LABELS: Readonly<Record<string, string>> = {
  "city-life": "Vida en la ciudad",
  "climate-policy": "Clima y medio ambiente",
  "culture-and-entertainment": "Cultura y ocio",
  "daily-routine": "Rutina diaria",
  directions: "Direcciones",
  education: "Educación",
  environment: "Medio ambiente",
  family: "Familia",
  food: "Comida",
  "free-time": "Tiempo libre",
  grammar: "Gramática",
  health: "Salud",
  "health-and-lifestyle": "Salud y estilo de vida",
  "health-and-psychology": "Salud y psicología",
  home: "La casa",
  "lifelong-learning": "Aprender toda la vida",
  "media-and-misinformation": "Medios y desinformación",
  "media-and-news": "Medios y noticias",
  "phrasal-verbs": "Phrasal verbs",
  "money-and-economy": "Dinero y economía",
  "money-and-shopping": "Dinero y compras",
  relationships: "Relaciones",
  "science-and-ethics": "Ciencia y ética",
  shopping: "Compras",
  technology: "Tecnología",
  travel: "Viajes",
  "travel-and-identity": "Viajes e identidad",
  vocabulary: "Vocabulario",
  weather: "El tiempo",
  work: "Trabajo",
  "work-and-careers": "Trabajo y carrera",
  "work-and-leadership": "Trabajo y liderazgo",
};

/** The topic's Spanish name; an unknown slug is shown as words ("new-topic" → "New topic"). */
export function topicLabel(topic: string): string {
  const known = TOPIC_LABELS[topic];
  if (known !== undefined) return known;
  const words = topic.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
