"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FieldDefinition, LayoutDocumentV1 } from "@/lib/crm-fields/tipos";
import { useT } from "@/lib/i18n/IdiomaProvider";

/**
 * Prévia do RASCUNHO com dados fictícios: mostra como a ficha vai se organizar
 * (abas, grupos, ordem, larguras), sem executar gravação nenhuma. A renderização
 * fiel — com os inputs reais — é a própria ficha depois de publicar.
 */
export function PreviaDaFicha({ doc, fields }: { doc: LayoutDocumentV1; fields: FieldDefinition[] }) {
  const t = useT();
  const porId = new Map(fields.map((f) => [f.id, f]));
  const exemplo = (tipo: string): string => {
    switch (tipo) {
      case "number":
        return "48";
      case "currency":
        return "1.250,50";
      case "date":
        return "12/03/2026";
      case "protected":
        return "••••••";
      default:
        return t("Texto de exemplo");
    }
  };

  const abas = doc.abas;
  return (
    <Card>
      <CardContent className="pt-4">
        <Tabs defaultValue={abas[0]?.id}>
          {abas.length > 1 ? (
            <TabsList>
              {abas.map((a) => (
                <TabsTrigger key={a.id} value={a.id}>{a.titulo}</TabsTrigger>
              ))}
            </TabsList>
          ) : null}
          {abas.map((a) => (
            <TabsContent key={a.id} value={a.id} className="mt-3 space-y-4">
              {a.grupos.map((g) => (
                <section key={g.id}>
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    {g.titulo}
                    {g.visivelQuando ? (
                      <Badge variant="outline" className="text-[10px]">{t("condicional")}</Badge>
                    ) : null}
                    {g.recolhido ? (
                      <Badge variant="outline" className="text-[10px]">{t("recolhido")}</Badge>
                    ) : null}
                  </h3>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
                    {g.campos.map((c) => {
                      const def = porId.get(c.field_id);
                      if (!def) return null;
                      const opcao = def.options.find((o) => !o.archived);
                      return (
                        <div key={c.field_id} className={c.largura === 2 ? "md:col-span-2" : undefined}>
                          <dt className="text-xs text-muted-foreground">
                            {def.label}
                            {c.destaque ? <span aria-hidden> ★</span> : null}
                          </dt>
                          <dd className="rounded-md border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                            {def.field_type === "select" && opcao ? opcao.label : exemplo(def.field_type)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
