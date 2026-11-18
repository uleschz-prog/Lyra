import { permanentRedirect } from "next/navigation";

// P1: la Biblioteca (imágenes y videos del estudio) se retiró; los enlaces viejos vuelven al inicio (308).
export default function LibraryPage() {
  permanentRedirect("/dashboard");
}
