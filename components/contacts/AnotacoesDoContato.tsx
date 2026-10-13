"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { Contact } from "@/lib/types/contacts";
import { NotePencil } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Mesmo teto do CHECK `contacts_notes_tamanho` (migration 0655). */
const LIMITE = 10_000;

interface Props {
  contactId: string;
  /** Sem permissão de escrita (suporte só-leitura, contato anonimizado). */
  readonly?: boolean;
  /** `painel` = compacto, no painel da conversa; `ficha` = página do contato. */
  variante?: "painel" | "ficha";
}

/**
 * Anotações PERMANENTES do contato: o que a equipe precisa lembrar sobre a
 * pessoa em qualquer conversa (preferências, combinados, contexto). Não é a
 * "Memória do contato", que a IA extrai das notas da conversa.
 *
 * Lê e grava pela rota do contato (`GET`/`PATCH /api/v1/contacts/[id]`), e não
 * pelo objeto da conversa: o realtime da Inbox não traz a coluna, e a anotação
 * tem de ser a mesma na ficha e no painel.
 */
export function AnotacoesDoContato({ contactId, readonly = false, variante = "painel" }: Props) {
  const t = useT();
  const campoId = useId();
  const [salvo, setSalvo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    apiClient
      .get<{ data: Contact }>(`/api/v1/contacts/${contactId}`)
      .then((r) => {
        if (cancelado) return;
        const atual = r.data.notes ?? "";
        setSalvo(atual);
        setTexto(atual);
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [contactId, tentativa]);

  const alterado = salvo !== null && texto !== salvo;
  const excedeu = texto.length > LIMITE;

  async function salvar() {
    if (!alterado || excedeu || salvando) return;
    setSalvando(true);
    try {
      const r = await apiClient.patch<{ data: Contact }>(`/api/v1/contacts/${contactId}`, { notes: texto });
      const gravado = r.data.notes ?? "";
      setSalvo(gravado);
      setTexto(gravado);
      toast.success(t("Anotações salvas."));
    } catch {
      toast.error(t("Não foi possível salvar as anotações. Tente de novo."));
    } finally {
      setSalvando(false);
    }
  }

  const compacto = variante === "painel";

  return (
    <section data-testid="anotacoes-do-contato" className={cn(!compacto && "space-y-2")}>
      <label
        htmlFor={campoId}
        className={cn(
          "flex items-center gap-1.5 font-semibold text-text",
          compacto ? "text-xs" : "text-sm",
        )}
      >
        <NotePencil size={compacto ? 13 : 16} weight="regular" aria-hidden className="text-text-muted" />
        {t("Anotações do contato")}
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("Ficam salvas no contato e aparecem em todas as conversas dele.")}
      </p>

      {carregando ? (
        <Skeleton className="mt-2 h-20 w-full" />
      ) : erro ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
          <span className="text-muted-foreground">{t("Não consegui carregar as anotações.")}</span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => {
              // O "carregando" nasce aqui, no gesto, e não no efeito: o
              // painel monta este componente com `key={contactId}`, então a
              // troca de contato já começa do estado inicial.
              setErro(false);
              setCarregando(true);
              setTentativa((n) => n + 1);
            }}>
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <Textarea
            id={campoId}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void salvar();
              }
            }}
            readOnly={readonly}
            rows={compacto ? 4 : 6}
            placeholder={readonly ? t("Sem anotações.") : t("Ex.: prefere contato à tarde; já enviou os documentos.")}
            aria-invalid={excedeu || undefined}
            className={cn(
              "resize-y border-warning-border bg-warning-bg/40 text-sm leading-relaxed text-text placeholder:text-text-muted",
              readonly && "cursor-default",
            )}
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn("text-[11px] tabular-nums", excedeu ? "font-medium text-error-fg" : "text-muted-foreground")}
              aria-live="polite"
            >
              {excedeu
                ? t("Passou do limite de 10.000 caracteres.")
                : alterado
                  ? t("Alterações não salvas")
                  : `${texto.length.toLocaleString("pt-BR")}/${LIMITE.toLocaleString("pt-BR")}`}
            </span>
            {!readonly && (
              <div className="flex gap-1.5">
                {alterado && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={salvando}
                    onClick={() => setTexto(salvo ?? "")}
                  >
                    {t("Descartar")}
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  disabled={!alterado || excedeu || salvando}
                  onClick={() => void salvar()}
                >
                  {salvando ? t("Salvando…") : t("Salvar anotações")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
