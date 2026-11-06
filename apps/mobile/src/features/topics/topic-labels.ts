/**
 * Spanish names of the content topics (the `topic` slug of a lesson or a study card), for the
 * lesson index and the "Fichas". The C1 topics are listed ahead of their lessons, so the C1
 * content needs no app change; a new topic slug needs its name here (a test fails otherwise).
 */
const TOPIC_LABELS: Readonly<Record<string, string>> = {
  // A1, in index order.
  greetings: "Saludos y presentaciones",
  "to-be-and-questions": "To be y preguntas",
  "numbers-and-age": "Números y edad",
  "my-family": "Mi familia",
  "colors-and-clothes": "Colores y ropa",
  "food-and-drinks": "Comidas y bebidas",
  "days-and-time": "Días y horas",
  "my-house": "Mi casa",
  // C1, in index order.
  "arts-and-culture": "Arte y cultura",
  "global-issues": "Problemas globales",
  "language-and-communication": "Lenguaje y comunicación",
  "law-and-ethics": "Derecho y ética",
  "politics-and-media": "Política y medios",
  "psychology-and-behaviour": "Psicología y conducta",
  "science-and-society": "Ciencia y sociedad",
  "work-and-negotiation": "Trabajo y negociación",
  // A2 to B2 and the study cards.
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
