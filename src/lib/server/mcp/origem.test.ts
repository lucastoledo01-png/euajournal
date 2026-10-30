import { describe, expect, it } from "vitest";
import { hostPublicoDoPedido, origemDoPedido } from "./origem";

describe("o endereço público do pedido", () => {
  it("atrás do Traefik vale o x-forwarded-host, não o host do contêiner", () => {
    const req = new Request("http://0.0.0.0:3000/api/newsletter", {
      headers: { "x-forwarded-host": "euajournal.com", "x-forwarded-proto": "https" },
    });
    expect(hostPublicoDoPedido(req)).toBe("euajournal.com");
    expect(origemDoPedido(req)).toBe("https://euajournal.com");
  });

  it("sem proxy, o host do pedido, sem a porta", () => {
    expect(hostPublicoDoPedido(new Request("http://localhost:3000/api/newsletter"))).toBe("localhost");
  });
});
