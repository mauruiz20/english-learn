import type { TransferFailure } from "../application/transfer-progress";

function minutes(seconds: number | null): string {
  const count = Math.max(1, Math.ceil((seconds ?? 60) / 60));
  return `${count} ${count === 1 ? "minuto" : "minutos"}`;
}

/** What went wrong with a transfer, for the learner (neutral Spanish). */
export function failureText({ reason, retryAfterSeconds }: TransferFailure): string {
  switch (reason) {
    case "offline":
      return "No hay conexión a internet. Revisa tu conexión y vuelve a intentarlo.";
    case "too-large":
      return "Tu progreso ocupa más de lo que podemos enviar de una vez. Vuelve a intentarlo más tarde.";
    case "rate-limited":
      return `Hubo demasiados intentos. Espera ${minutes(retryAfterSeconds)} y vuelve a intentarlo.`;
    case "not-found":
      return "Este enlace ya se usó o venció (dura 15 minutos). Vuelve al sitio anterior y pulsa «Llevar mi progreso» otra vez.";
    case "server":
      return "No pudimos conectar con el servidor. Vuelve a intentarlo en un momento.";
  }
}
