"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useModeloDaFicha } from "@/hooks/crm-fields/useFichas";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  centavosParaTexto,
  estaPreenchido,
  textoParaCentavos,
  textoParaInteiro,
} from "@/lib/contacts/ficha-do-contato";
import { modeloTemCampos } from "@/lib/crm-fields/padrao-do-contato";
import type { AbaResolvida, CampoResolvido, GrupoResolvido } from "@/lib/crm-fields/tipos";
import { gruposVisiveisDoModelo } from "@/lib/crm-fields/visibilidade";
import type { Contact } from "@/lib/types/contacts";
import { CaretDown, CaretRight, Check, Eye, EyeSlash, IdentificationCard } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Valor do Radix Select para "sem resposta" — o Radix não aceita item com valor vazio. */
const VAZIO = "__vazio__";

interface ContatoDaFicha {
  custom_fields: Record<string, unknown>;
  cpf_available: boolean;
  birthdate: string | null;
  email: string | null;
}

interface Props {
  contactId: string;
  /** Suporte só-leitura ou contato anonimizado. */
  readonly?: boolean;
  /** `painel` = coluna estreita da conversa; `ficha` = página do contato, em duas colunas. */
  variante?: "painel" | "ficha";
}

/**
 * A ficha do pré-atendimento, em grupos que abrem e fecham (estilo Kommo).
 * Cada campo salva sozinho ao sair dele.
 *
 * O DESENHO da ficha (abas, grupos, ordem) vem do modelo resolvido em
 * Configurações → Fichas e campos (`/api/v1/crm/layouts/resolve`). Três estados
 * além da ficha em si, e nenhum inventa campo: carregando (esqueleto), leitura
 * que falhou (aviso com "tentar de novo" — trocar a ficha por outra faria quem
 * atende achar que o dado sumiu) e organização que ainda não publicou ficha
 * (estado vazio com o caminho para montá-la).
 *
 * Grava pela rota do contato (`PATCH /api/v1/contacts/[id]`), que SUBSTITUI
 * `custom_fields` inteiro: por isso cada gravação parte do objeto mais recente
 * que o servidor devolveu (`atualRef`) e as gravações andam em fila — duas
 * saídas de campo seguidas não podem apagar uma à outra.
 */
export function FichaDoContato({ contactId, readonly = false, variante = "painel" }: Props) {
  const t = useT();
  const [contato, setContato] = useState<ContatoDaFicha | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [salvoAgora, setSalvoAgora] = useState<string | null>(null);
  const atualRef = useRef<Record<string, unknown>>({});
  const filaRef = useRef<Promise<void>>(Promise.resolve());

  const modeloQ = useModeloDaFicha();
  const { user, activeOrg } = useAuth();
  const podeConfigurar =
    (user.is_platform_admin && !user.support) || (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin);

  useEffect(() => {
    let cancelado = false;
    apiClient
      .get<{ data: Contact & { cpf_available?: boolean } }>(`/api/v1/contacts/${contactId}`)
      .then((r) => {
        if (cancelado) return;
        const c: ContatoDaFicha = {
          custom_fields: r.data.custom_fields ?? {},
          cpf_available: r.data.cpf_available ?? Boolean(r.data.cpf_hash),
          birthdate: r.data.birthdate ?? null,
          email: r.data.email ?? null,
        };
        atualRef.current = c.custom_fields;
        setContato(c);
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
    };
  }, [contactId, tentativa]);

  function marcarSalvo(chave: string) {
    setSalvoAgora(chave);
    setTimeout(() => setSalvoAgora((atual) => (atual === chave ? null : atual)), 1500);
  }

  /** Enfileira uma gravação; devolve `false` quando o servidor recusou. */
  function gravar(chave: string, corpo: () => Record<string, unknown>): Promise<boolean> {
    let ok = false;
    const passo = filaRef.current.then(async () => {
      try {
        const r = await apiClient.patch<{ data: Contact & { cpf_available?: boolean } }>(
          `/api/v1/contacts/${contactId}`,
          corpo(),
        );
        atualRef.current = r.data.custom_fields ?? {};
        setContato({
          custom_fields: atualRef.current,
          // A resposta do PATCH traz `cpf_hash`, não `cpf_available`.
          cpf_available: r.data.cpf_available ?? Boolean(r.data.cpf_hash),
          birthdate: r.data.birthdate ?? null,
          email: r.data.email ?? null,
        });
        marcarSalvo(chave);
        ok = true;
      } catch (e) {
        const mensagem = e instanceof Error && e.message ? e.message : "";
        toast.error(mensagem || t("Não foi possível salvar. Tente de novo."));
      }
    });
    filaRef.current = passo;
    return passo.then(() => ok);
  }

  function salvarPersonalizado(chave: string, valor: unknown): Promise<boolean> {
    return gravar(chave, () => {
      const proximo = { ...atualRef.current };
      if (valor === null) delete proximo[chave];
      else proximo[chave] = valor;
      return { custom_fields: proximo };
    });
  }

  if (erro) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
        <span className="text-muted-foreground">{t("Não consegui carregar a ficha do contato.")}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setErro(false);
            setTentativa((n) => n + 1);
          }}
        >
          {t("Tentar de novo")}
        </Button>
      </div>
    );
  }

  if (modeloQ.isError) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
        <span className="text-muted-foreground">{t("Não consegui carregar a ficha do contato.")}</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void modeloQ.refetch()}>
          {t("Tentar de novo")}
        </Button>
      </div>
    );
  }

  const modelo = modeloQ.data;
  if (!contato || !modelo) return <Skeleton className="h-40 w-full" />;

  const compacto = variante === "painel";

  if (!modeloTemCampos(modelo)) {
    return (
      <section data-testid="ficha-do-contato-vazia" className="space-y-1">
        <h3 className={cn("flex items-center gap-1.5 font-semibold text-text", compacto ? "text-xs" : "text-sm")}>
          <IdentificationCard size={compacto ? 13 : 16} aria-hidden className="text-text-muted" />
          {t("Ficha do contato")}
        </h3>
        <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs text-text-muted">
          <p>{t("A ficha do contato ainda não foi montada nesta organização.")}</p>
          {podeConfigurar ? (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Link href="/app/settings/fichas">{t("Montar a ficha")}</Link>
            </Button>
          ) : (
            <p>{t("Peça a quem administra para montá-la em Configurações → Fichas e campos.")}</p>
          )}
        </div>
      </section>
    );
  }

  const gruposDe = (aba: AbaResolvida) => (
    <div className="divide-y divide-border rounded-md border border-border">
      {gruposVisiveisDoModelo(aba, contato.custom_fields).map((grupo) => {
        const campos = grupo.campos.filter(
          (c) => !c.arquivado || c.nativo || estaPreenchido(contato.custom_fields[c.chave]),
        );
        if (campos.length === 0) return null;
        const aberto = abertos[grupo.id] ?? !grupo.recolhido;
        return (
          <div key={grupo.id} data-testid={`ficha-grupo-${grupo.id}`}>
            <button
              type="button"
              aria-expanded={aberto}
              onClick={() => setAbertos((a) => ({ ...a, [grupo.id]: !aberto }))}
              className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              {aberto ? <CaretDown size={12} aria-hidden /> : <CaretRight size={12} aria-hidden />}
              <span className="flex-1">{grupo.titulo}</span>
              {grupo.contarPreenchidos && <Contagem grupo={grupo} contato={contato} t={t} />}
            </button>
            {aberto && (
              <div className={cn("px-2.5 pb-2.5", compacto ? "space-y-1.5" : "grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2")}>
                {campos.map((campo) => (
                  <LinhaDoCampo
                    key={campo.chave}
                    campo={campo}
                    contato={contato}
                    readonly={readonly || Boolean(campo.arquivado)}
                    compacto={compacto}
                    salvo={salvoAgora === campo.chave}
                    onSalvarPersonalizado={salvarPersonalizado}
                    onSalvarNativo={(chave, corpo) => gravar(chave, () => corpo)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <section data-testid="ficha-do-contato" className="space-y-1">
      <h3 className={cn("flex items-center gap-1.5 font-semibold text-text", compacto ? "text-xs" : "text-sm")}>
        <IdentificationCard size={compacto ? 13 : 16} aria-hidden className="text-text-muted" />
        {t("Ficha do contato")}
      </h3>
      {modelo.abas.length > 1 ? (
        <Tabs defaultValue={modelo.abas[0]?.id}>
          <TabsList className="h-8">
            {modelo.abas.map((aba) => (
              <TabsTrigger key={aba.id} value={aba.id} className="text-xs">
                {aba.titulo}
              </TabsTrigger>
            ))}
          </TabsList>
          {modelo.abas.map((aba) => (
            <TabsContent key={aba.id} value={aba.id} className="mt-1.5">
              {gruposDe(aba)}
            </TabsContent>
          ))}
        </Tabs>
      ) : modelo.abas[0] ? (
        gruposDe(modelo.abas[0])
      ) : null}
    </section>
  );
}

function Contagem({ grupo, contato, t }: { grupo: GrupoResolvido; contato: ContatoDaFicha; t: (s: string) => string }) {
  const total = grupo.campos.length;
  const feitos = grupo.campos.filter((c) =>
    c.nativo === "cpf"
      ? contato.cpf_available
      : c.nativo
        ? estaPreenchido(contato[c.nativo])
        : estaPreenchido(contato.custom_fields[c.chave]),
  ).length;
  return (
    <span className="font-normal normal-case tracking-normal tabular-nums">
      {t("{feitos} de {total}").replace("{feitos}", String(feitos)).replace("{total}", String(total))}
    </span>
  );
}

/** O texto que o campo mostra para o valor guardado. */
function textoDoValor(campo: CampoResolvido, contato: ContatoDaFicha): string {
  if (campo.nativo === "cpf") return "";
  if (campo.nativo) return contato[campo.nativo] ?? "";
  const v = contato.custom_fields[campo.chave];
  if (campo.tipo === "moeda") return centavosParaTexto(v);
  if (v === null || v === undefined) return "";
  return String(v);
}

interface LinhaProps {
  campo: CampoResolvido;
  contato: ContatoDaFicha;
  readonly: boolean;
  compacto: boolean;
  salvo: boolean;
  onSalvarPersonalizado: (chave: string, valor: unknown) => Promise<boolean>;
  onSalvarNativo: (chave: string, corpo: Record<string, unknown>) => Promise<boolean>;
  t: (s: string) => string;
}

const CLASSE_DO_CAMPO =
  "h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-text placeholder:text-text-subtle hover:border-border focus:border-ring focus:bg-surface focus:outline-hidden disabled:cursor-default disabled:hover:border-transparent";

function LinhaDoCampo({ campo, contato, readonly, compacto, salvo, onSalvarPersonalizado, onSalvarNativo, t }: LinhaProps) {
  const guardado = textoDoValor(campo, contato);
  const [texto, setTexto] = useState(guardado);
  const [mostrar, setMostrar] = useState(false);
  const id = `ficha-${campo.chave}`;

  // O valor do servidor manda quando muda por fora (outra gravação, recarga).
  // Ajuste durante o render, e não num efeito: é o padrão do React para estado
  // derivado de prop, sem a renderização a mais.
  const [guardadoAnterior, setGuardadoAnterior] = useState(guardado);
  if (guardado !== guardadoAnterior) {
    setGuardadoAnterior(guardado);
    setTexto(guardado);
  }

  async function confirmar() {
    if (readonly || texto === guardado) return;
    const limpo = texto.trim();

    if (campo.nativo) {
      // CPF, nascimento e e-mail são colunas do contato: não dá para "apagar"
      // por aqui (o e-mail e o CPF têm regra própria de remoção).
      if (limpo === "") {
        setTexto(guardado);
        return;
      }
      const valor = campo.nativo === "cpf" ? limpo.replace(/\D/g, "") : limpo;
      const ok = await onSalvarNativo(campo.chave, { [campo.nativo]: valor });
      if (!ok) setTexto(guardado);
      else if (campo.nativo === "cpf") setTexto("");
      return;
    }

    let valor: unknown;
    if (campo.tipo === "moeda") valor = textoParaCentavos(limpo);
    else if (campo.tipo === "numero") valor = textoParaInteiro(limpo);
    else valor = limpo === "" ? null : limpo;

    if (valor === undefined) {
      toast.error(
        campo.tipo === "moeda"
          ? t("Valor inválido. Use o formato 1.250,50.")
          : t("Use só números inteiros."),
      );
      setTexto(guardado);
      return;
    }
    const ok = await onSalvarPersonalizado(campo.chave, valor);
    if (!ok) setTexto(guardado);
  }

  let controle: React.ReactNode;
  if (campo.tipo === "lista") {
    const opcoes = (campo.opcoes ?? []).filter((o) => !o.archived || o.id === guardado);
    const atual = guardado === "" ? VAZIO : guardado;
    controle = (
      <Select
        value={atual}
        disabled={readonly}
        onValueChange={(v) => {
          void onSalvarPersonalizado(campo.chave, v === VAZIO ? null : v);
        }}
      >
        <SelectTrigger id={id} className={cn(CLASSE_DO_CAMPO, "justify-between shadow-none")}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={VAZIO}>—</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
          {/* Valor antigo fora da lista continua aparecendo, em vez de sumir. */}
          {guardado !== "" && !opcoes.some((o) => o.id === guardado) && (
            <SelectItem value={guardado}>{guardado}</SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  } else if (campo.tipo === "protegido" && !mostrar) {
    controle = (
      <div className="flex h-7 items-center gap-1 px-1.5 text-sm">
        <span className="flex-1 tracking-widest text-text-muted">{guardado ? "••••••••" : "—"}</span>
        <button
          type="button"
          onClick={() => setMostrar(true)}
          aria-label={t("Mostrar senha")}
          className="rounded-md p-1 text-text-muted hover:bg-surface-elevated"
        >
          <Eye size={14} aria-hidden />
        </button>
      </div>
    );
  } else {
    controle = (
      <div className="flex items-center gap-1">
        {campo.tipo === "moeda" && <span className="pl-1.5 text-xs text-text-muted">R$</span>}
        <input
          id={id}
          type={campo.tipo === "data" ? "date" : "text"}
          inputMode={campo.tipo === "moeda" ? "decimal" : campo.tipo === "numero" ? "numeric" : undefined}
          autoComplete="off"
          value={texto}
          disabled={readonly}
          placeholder={campo.nativo === "cpf" && contato.cpf_available ? t("Cadastrado (protegido)") : "—"}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => void confirmar()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTexto(guardado);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(CLASSE_DO_CAMPO, campo.tipo === "moeda" || campo.tipo === "numero" ? "tabular-nums" : "")}
        />
        {campo.tipo === "protegido" && (
          <button
            type="button"
            onClick={() => setMostrar(false)}
            aria-label={t("Ocultar senha")}
            className="rounded-md p-1 text-text-muted hover:bg-surface-elevated"
          >
            <EyeSlash size={14} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid items-center gap-x-2",
        compacto ? "grid-cols-[minmax(0,42%)_minmax(0,1fr)]" : "grid-cols-[minmax(0,40%)_minmax(0,1fr)]",
        !compacto && campo.largura === 2 ? "md:col-span-2" : "",
      )}
      title={campo.dica}
    >
      <label htmlFor={id} className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
        {/* Quebra em vez de cortar: "Capitalização diária" cortado em
            "Capitalização diá…" obrigava a abrir a página para saber o campo. */}
        <span className={cn("leading-tight wrap-anywhere", campo.destaque ? "font-medium text-text" : "")}>
          {campo.rotulo}
        </span>
        {salvo && (
          <span className="inline-flex shrink-0 items-center text-success" aria-live="polite">
            <Check size={11} weight="bold" aria-hidden />
            <span className="sr-only">{t("Salvo")}</span>
          </span>
        )}
      </label>
      {controle}
    </div>
  );
}
