/**
 * Configurações → Fichas e campos. Onde o admin cria campos com identidade
 * estável e desenha o layout da ficha do contato (abas, grupos, ordem), com
 * rascunho e publicação versionada (migration 9001, fork QMZ).
 *
 * ── Por que `admin`, e não `manager` ─────────────────────────────────────────
 *
 * Publicar aqui muda a ficha de TODO MUNDO da organização — inclusive o que a
 * equipe enxerga de um processo em segredo de justiça. É o mesmo alcance da
 * configuração da empresa, não o da operação de atendimento. O gate da tela
 * espelha o das rotas (`requireRole("admin")` em /api/v1/crm/*): tela e
 * servidor dizem a mesma coisa.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { FichasClient } from "./_client";

export const metadata = { title: "Fichas e campos" };
export const dynamic = "force-dynamic";

export default async function FichasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Fichas e campos")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Crie campos e organize a ficha do contato em abas e grupos. Renomear nunca perde o que já foi preenchido.")}
        </p>
      </header>
      <FichasClient />
    </div>
  );
}
