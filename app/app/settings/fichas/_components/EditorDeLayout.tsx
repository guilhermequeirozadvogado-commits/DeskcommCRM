"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { FieldDefinition, LayoutAba, LayoutDocumentV1, LayoutGrupo } from "@/lib/crm-fields/tipos";
import { useT } from "@/lib/i18n/IdiomaProvider";
import { CaretDown, CaretUp, Plus, Trash } from "@/lib/ui/icons";

/**
 * O construtor de abas → grupos → campos. Toda ação é por BOTÃO (subir, descer,
 * mover para grupo), nunca só por arrasto — é o padrão da tela de etapas do
 * funil, e é o que funciona por teclado. O componente é controlado: cada ação
 * produz um documento novo via `onChange`, e quem decide salvar/publicar é a
 * barra de publicação.
 */

const SENTINELA_SEM_CONDICAO = "__sempre__";

function clonar(doc: LayoutDocumentV1): LayoutDocumentV1 {
  return JSON.parse(JSON.stringify(doc)) as LayoutDocumentV1;
}

function mover<T>(lista: T[], de: number, para: number) {
  if (para < 0 || para >= lista.length) return;
  const [item] = lista.splice(de, 1);
  lista.splice(para, 0, item as T);
}

function idNovo(prefixo: string, usados: Set<string>): string {
  let n = 1;
  while (usados.has(`${prefixo}-${n}`)) n += 1;
  return `${prefixo}-${n}`;
}

function idsDoDocumento(doc: LayoutDocumentV1): Set<string> {
  return new Set(doc.abas.flatMap((a) => [a.id, ...a.grupos.map((g) => g.id)]));
}

export function EditorDeLayout({
  doc,
  fields,
  onChange,
}: {
  doc: LayoutDocumentV1;
  fields: FieldDefinition[];
  onChange: (doc: LayoutDocumentV1) => void;
}) {
  const t = useT();
  const porId = new Map(fields.map((f) => [f.id, f]));
  const usados = new Set(doc.abas.flatMap((a) => a.grupos.flatMap((g) => g.campos.map((c) => c.field_id))));
  const disponiveis = fields.filter((f) => f.lifecycle === "active" && !usados.has(f.id));
  const camposDeLista = fields.filter((f) => f.lifecycle === "active" && f.field_type === "select");

  const aplicar = (muta: (d: LayoutDocumentV1) => void) => {
    const novo = clonar(doc);
    muta(novo);
    onChange(novo);
  };

  const renderGrupo = (aba: LayoutAba, grupo: LayoutGrupo, ia: number, ig: number) => {
    const condicao = grupo.visivelQuando ? porId.get(grupo.visivelQuando.field_id) : undefined;
    return (
      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t("Nome do grupo")}
            className="h-8 w-56"
            value={grupo.titulo}
            onChange={(e) => aplicar((d) => { d.abas[ia]!.grupos[ig]!.titulo = e.target.value; })}
          />
          <Button variant="ghost" size="icon" aria-label={t("Subir grupo")} disabled={ig === 0}
            onClick={() => aplicar((d) => mover(d.abas[ia]!.grupos, ig, ig - 1))}>
            <CaretUp className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("Descer grupo")} disabled={ig === aba.grupos.length - 1}
            onClick={() => aplicar((d) => mover(d.abas[ia]!.grupos, ig, ig + 1))}>
            <CaretDown className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("Remover grupo vazio")} disabled={grupo.campos.length > 0}
            title={grupo.campos.length > 0 ? t("Tire os campos do grupo antes de removê-lo.") : undefined}
            onClick={() => aplicar((d) => { d.abas[ia]!.grupos.splice(ig, 1); })}>
            <Trash className="size-4" />
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={grupo.recolhido ?? false}
              onCheckedChange={(v) => aplicar((d) => { d.abas[ia]!.grupos[ig]!.recolhido = v || undefined; })} />
            {t("Começa recolhido")}
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={grupo.contarPreenchidos ?? false}
              onCheckedChange={(v) => aplicar((d) => { d.abas[ia]!.grupos[ig]!.contarPreenchidos = v || undefined; })} />
            {t("Mostrar preenchidos")}
          </label>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("Aparece quando")}</span>
          <Select
            value={grupo.visivelQuando?.field_id ?? SENTINELA_SEM_CONDICAO}
            onValueChange={(v) =>
              aplicar((d) => {
                d.abas[ia]!.grupos[ig]!.visivelQuando =
                  v === SENTINELA_SEM_CONDICAO ? undefined : { field_id: v, valores: [] };
              })
            }
          >
            <SelectTrigger className="h-7 w-52 text-xs" aria-label={t("Aparece quando")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SENTINELA_SEM_CONDICAO}>{t("Sempre visível")}</SelectItem>
              {camposDeLista.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {grupo.visivelQuando && condicao
            ? condicao.options.filter((o) => !o.archived).map((o) => {
                const ligada = grupo.visivelQuando!.valores.includes(o.id);
                return (
                  <Button key={o.id} type="button" size="sm" variant={ligada ? "default" : "outline"} className="h-6 px-2 text-xs"
                    onClick={() =>
                      aplicar((d) => {
                        const cond = d.abas[ia]!.grupos[ig]!.visivelQuando!;
                        cond.valores = ligada ? cond.valores.filter((v) => v !== o.id) : [...cond.valores, o.id];
                      })
                    }>
                    {o.label}
                  </Button>
                );
              })
            : null}
        </div>

        <ul className="mt-3 space-y-1.5">
          {grupo.campos.map((campo, ic) => {
            const def = porId.get(campo.field_id);
            return (
              <li key={campo.field_id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{def?.label ?? t("Campo removido do catálogo")}</span>
                {def ? <Badge variant="secondary" className="text-[10px]">{def.field_type}</Badge> : null}
                {def?.lifecycle === "archived" ? (
                  <Badge variant="outline" className="text-[10px]">{t("arquivado")}</Badge>
                ) : null}
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Switch checked={campo.destaque ?? false}
                    onCheckedChange={(v) => aplicar((d) => { d.abas[ia]!.grupos[ig]!.campos[ic]!.destaque = v || undefined; })} />
                  {t("Destaque")}
                </label>
                <Button variant="ghost" size="icon" aria-label={t("Subir campo")} disabled={ic === 0}
                  onClick={() => aplicar((d) => mover(d.abas[ia]!.grupos[ig]!.campos, ic, ic - 1))}>
                  <CaretUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("Descer campo")} disabled={ic === grupo.campos.length - 1}
                  onClick={() => aplicar((d) => mover(d.abas[ia]!.grupos[ig]!.campos, ic, ic + 1))}>
                  <CaretDown className="size-4" />
                </Button>
                <Select
                  value={grupo.id}
                  onValueChange={(destino) =>
                    aplicar((d) => {
                      const origem = d.abas[ia]!.grupos[ig]!;
                      const [movido] = origem.campos.splice(ic, 1);
                      for (const a of d.abas) {
                        const g = a.grupos.find((x) => x.id === destino);
                        if (g && movido) g.campos.push(movido);
                      }
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-40 text-xs" aria-label={t("Mover para o grupo")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {doc.abas.flatMap((a) =>
                      a.grupos.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {a.titulo} · {g.titulo}
                        </SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" aria-label={t("Tirar da ficha")}
                  title={t("O campo sai do layout; o valor e a definição continuam existindo.")}
                  onClick={() => aplicar((d) => { d.abas[ia]!.grupos[ig]!.campos.splice(ic, 1); })}>
                  <Trash className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>

        {disponiveis.length > 0 ? (
          <div className="mt-2">
            <Select
              value=""
              onValueChange={(fieldId) =>
                aplicar((d) => { d.abas[ia]!.grupos[ig]!.campos.push({ field_id: fieldId }); })
              }
            >
              <SelectTrigger className="h-8 w-64 text-xs" aria-label={t("Adicionar campo do catálogo")}>
                <SelectValue placeholder={t("Adicionar campo do catálogo…")} />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {doc.abas.map((aba, ia) => (
        <Card key={aba.id}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 py-3">
            <Input
              aria-label={t("Nome da aba")}
              className="h-8 w-56 font-medium"
              value={aba.titulo}
              onChange={(e) => aplicar((d) => { d.abas[ia]!.titulo = e.target.value; })}
            />
            <Button variant="ghost" size="icon" aria-label={t("Subir aba")} disabled={ia === 0}
              onClick={() => aplicar((d) => mover(d.abas, ia, ia - 1))}>
              <CaretUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("Descer aba")} disabled={ia === doc.abas.length - 1}
              onClick={() => aplicar((d) => mover(d.abas, ia, ia + 1))}>
              <CaretDown className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("Remover aba vazia")}
              disabled={doc.abas.length === 1 || aba.grupos.some((g) => g.campos.length > 0)}
              onClick={() => aplicar((d) => { d.abas.splice(ia, 1); })}>
              <Trash className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-auto"
              onClick={() =>
                aplicar((d) => {
                  d.abas[ia]!.grupos.push({ id: idNovo("grupo", idsDoDocumento(d)), titulo: t("Novo grupo"), campos: [] });
                })
              }>
              <Plus className="mr-1 size-4" />
              {t("Grupo")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {aba.grupos.map((grupo, ig) => (
              <div key={grupo.id}>{renderGrupo(aba, grupo, ia, ig)}</div>
            ))}
            {aba.grupos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Aba sem grupos — adicione um grupo para receber campos.")}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" disabled={doc.abas.length >= 5}
        onClick={() =>
          aplicar((d) => {
            d.abas.push({ id: idNovo("aba", idsDoDocumento(d)), titulo: t("Nova aba"), grupos: [] });
          })
        }>
        <Plus className="mr-1 size-4" />
        {t("Adicionar aba")}
      </Button>
    </div>
  );
}
