/** Spanish names of the content topics (the `topic` slug of a lesson), for the lesson index. */
const TOPIC_LABELS: Readonly<Record<string, string>> = {
  "city-life": "Vida en la ciudad",
  "culture-and-entertainment": "Cultura y ocio",
  "daily-routine": "Rutina diaria",
  directions: "Direcciones",
  education: "Educación",
  environment: "Medio ambiente",
  family: "Familia",
  food: "Comida",
  "free-time": "Tiempo libre",
  health: "Salud",
  "health-and-lifestyle": "Salud y estilo de vida",
  home: "La casa",
  "media-and-news": "Medios y noticias",
  "money-and-shopping": "Dinero y compras",
  relationships: "Relaciones",
  shopping: "Compras",
  technology: "Tecnología",
  travel: "Viajes",
  weather: "El tiempo",
  work: "Trabajo",
  "work-and-careers": "Trabajo y carrera",
};

/** The topic's Spanish name; an unknown slug is shown as words ("new-topic" → "New topic"). */
export function topicLabel(topic: string): string {
  const known = TOPIC_LABELS[topic];
  if (known !== undefined) return known;
  const words = topic.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
