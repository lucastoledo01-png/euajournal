import { Suspense } from "react";
import { AutorizarClaude } from "./AutorizarClaude";

/** A tela que o Claude abre no navegador para conectar ao eua.journal (OAuth). */
export default function PaginaDeAutorizar() {
  return (
    <Suspense>
      <AutorizarClaude />
    </Suspense>
  );
}
